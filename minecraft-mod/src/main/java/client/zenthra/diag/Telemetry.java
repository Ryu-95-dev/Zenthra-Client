package client.zenthra.diag;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Platform;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayDeque;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.minecraft.client.Minecraft;

/**
 * Real performance measurements, shown in the in-game menu and written every
 * two seconds to <gameDir>/zenthra/telemetry.json for the launcher's
 * diagnostics page (format: shared/zenthra-config.md, "Télémétrie locale").
 * Nothing leaves the computer.
 */
public final class Telemetry {
	public static final int FORMAT_VERSION = 1;
	private static final Gson GSON = new Gson();
	private static final long WINDOW_NS = 2_000_000_000L;

	private final Path file = FabricLoader.getInstance().getGameDir().resolve("zenthra").resolve("telemetry.json");
	private final ArrayDeque<long[]> frames = new ArrayDeque<>(); // {timestamp, duration}
	private final ArrayDeque<Integer> fpsSamples = new ArrayDeque<>();
	private long lastFrame;
	private long startupMs = -1;
	private int ticks;

	/** Called once the client has finished starting. */
	public void markStarted() {
		startupMs = System.currentTimeMillis() - ManagementFactory.getRuntimeMXBean().getStartTime();
		ZenthraClient.LOGGER.info("Client prêt en {} ms.", startupMs);
	}

	/** Called at the end of every rendered world frame. */
	public void onFrame() {
		long now = System.nanoTime();
		if (lastFrame != 0) frames.addLast(new long[] {now, now - lastFrame});
		lastFrame = now;
		while (!frames.isEmpty() && now - frames.peekFirst()[0] > WINDOW_NS) frames.pollFirst();
	}

	/** Called every client tick. */
	public void tick(Minecraft mc) {
		if (++ticks % 40 != 0) return; // every 2 s
		fpsSamples.addLast(mc.getFps());
		while (fpsSamples.size() > 15) fpsSamples.pollFirst(); // last 30 s
		if (mc.level == null) lastFrame = 0;
		write(snapshot(mc));
	}

	public int fps() {
		return Minecraft.getInstance().getFps();
	}

	public double averageFps() {
		return fpsSamples.stream().mapToInt(Integer::intValue).average().orElse(fps());
	}

	/** Average and worst frame time (ms) over the last two seconds, or null outside a world. */
	public double[] frameTimes() {
		if (frames.isEmpty()) return null;
		long sum = 0, max = 0;
		for (long[] f : frames) {
			sum += f[1];
			max = Math.max(max, f[1]);
		}
		return new double[] {sum / 1e6 / frames.size(), max / 1e6};
	}

	public long startupMs() {
		return startupMs;
	}

	/** True for mods the player installed (not Java, Minecraft, the loader or Fabric API sub-modules). */
	static boolean isUserMod(ModContainer m) {
		String id = m.getMetadata().getId();
		return !(id.equals("java") || id.equals("minecraft") || id.equals("fabricloader") || id.equals("mixinextras")
			|| id.startsWith("fabric-") && !id.equals("fabric-api") || m.getContainingMod().isPresent());
	}

	public long userModCount() {
		return FabricLoader.getInstance().getAllMods().stream().filter(Telemetry::isUserMod).count();
	}

	public JsonObject snapshot(Minecraft mc) {
		Runtime rt = Runtime.getRuntime();
		JsonObject o = new JsonObject();
		o.addProperty("formatVersion", FORMAT_VERSION);
		o.addProperty("writtenAt", System.currentTimeMillis());
		o.addProperty("pid", ProcessHandle.current().pid());
		o.addProperty("fps", fps());
		o.addProperty("fpsAvg", Math.round(averageFps() * 10) / 10.0);
		double[] ft = mc.level != null ? frameTimes() : null;
		if (ft != null) {
			o.addProperty("frameMsAvg", Math.round(ft[0] * 100) / 100.0);
			o.addProperty("frameMsMax", Math.round(ft[1] * 100) / 100.0);
		}
		o.addProperty("inWorld", mc.level != null);
		o.addProperty("memUsedMb", (rt.totalMemory() - rt.freeMemory()) / 1048576);
		o.addProperty("memAllocatedMb", rt.totalMemory() / 1048576);
		o.addProperty("memMaxMb", rt.maxMemory() / 1048576);
		o.addProperty("javaVersion", System.getProperty("java.version"));
		o.addProperty("javaVendor", System.getProperty("java.vendor"));
		o.addProperty("mcVersion", Platform.mcVersion());
		o.addProperty("loader", "fabric");
		FabricLoader.getInstance().getModContainer("fabricloader")
			.ifPresent(m -> o.addProperty("loaderVersion", m.getMetadata().getVersion().getFriendlyString()));
		o.addProperty("startupMs", startupMs);
		o.addProperty("renderDistance", mc.options.renderDistance().get());
		o.addProperty("gpu", Platform.gpu());
		o.addProperty("gpuVendor", Platform.gpuVendor());
		o.addProperty("cpu", Platform.cpu());
		JsonArray mods = new JsonArray();
		int total = 0;
		for (ModContainer m : FabricLoader.getInstance().getAllMods()) {
			total++;
			// Hide the dozens of Fabric API sub-modules and built-ins: they are not separate downloads.
			if (!isUserMod(m)) continue;
			JsonObject mod = new JsonObject();
			mod.addProperty("id", m.getMetadata().getId());
			mod.addProperty("name", m.getMetadata().getName());
			mod.addProperty("version", m.getMetadata().getVersion().getFriendlyString());
			mods.add(mod);
		}
		o.add("mods", mods);
		o.addProperty("modCountTotal", total);
		return o;
	}

	private void write(JsonObject o) {
		try {
			Files.createDirectories(file.getParent());
			Path tmp = file.resolveSibling("telemetry.json.tmp");
			Files.writeString(tmp, GSON.toJson(o), StandardCharsets.UTF_8);
			Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
		} catch (IOException e) {
			// Diagnostics must never disturb the game: ignore write failures.
		}
	}
}
