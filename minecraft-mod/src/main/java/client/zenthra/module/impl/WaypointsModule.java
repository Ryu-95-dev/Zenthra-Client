package client.zenthra.module.impl;

import client.zenthra.ZenthraClient;
import client.zenthra.gui.WaypointEditScreen;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;
import org.joml.Vector4f;

public class WaypointsModule extends Module {
	public static final class Waypoint {
		public String name;
		public int x, y, z;
		public String dimension;
		public int color;
		public boolean visible = true;
		/** World or server it belongs to ("server:<ip>" / "local:<world>"); null = every world. */
		public String world;

		public Waypoint(String name, int x, int y, int z, String dimension, int color) {
			this.name = name;
			this.x = x;
			this.y = y;
			this.z = z;
			this.dimension = dimension;
			this.color = color;
		}
	}

	private final List<Waypoint> waypoints = new ArrayList<>();
	private final BooleanSetting showDistance = add(new BooleanSetting("show_distance", "Afficher la distance", true));
	private final NumberSetting maxDistance = add(new NumberSetting("max_distance", "Distance maximale d'affichage", 2000, 50, 10000, 50, " blocs"));
	private final ChoiceSetting scope = add(new ChoiceSetting("scope", "Repères affichés",
		List.of("world", "all"), List.of("Monde ou serveur actuel", "Tous les mondes"), "world"));

	// Matrices captured during world rendering, used to project waypoints on the HUD.
	private final Matrix4f view = new Matrix4f();
	private final Matrix4f projection = new Matrix4f();
	private Vec3 cameraPos = Vec3.ZERO;
	private boolean haveMatrices;

	public WaypointsModule() {
		super("waypoints", "Waypoints", "Repères personnalisés avec nom, couleur et distance.", Category.WORLD, true);
	}

	@Override
	public String hint() {
		return "Touche B : ajouter un repère à ta position. Gestion complète dans Modules Zenthra → Waypoints.";
	}

	public List<Waypoint> list() {
		return waypoints;
	}

	public String currentDimension() {
		return mc.level != null ? Platform.dimensionId(mc.level) : "minecraft:overworld";
	}

	/** Identifies the current server or singleplayer world, or null when unknown. */
	public String currentWorld() {
		String local = Platform.singleplayerWorldName();
		if (local != null) return "local:" + local;
		if (mc.getCurrentServer() != null) return "server:" + mc.getCurrentServer().ip.toLowerCase(java.util.Locale.ROOT);
		return null;
	}

	/** Same dimension, and same world/server unless the player chose to see every world's waypoints. */
	public boolean belongsHere(Waypoint wp) {
		if (!wp.dimension.equals(currentDimension())) return false;
		return scope.is("all") || wp.world == null || wp.world.equals(currentWorld());
	}

	/** New waypoint at the player's position, tied to the current world. */
	public Waypoint createHere(String name) {
		Waypoint wp = new Waypoint(name, mc.player.getBlockX(), mc.player.getBlockY(), mc.player.getBlockZ(), currentDimension(), 0xFFA855F7);
		wp.world = currentWorld();
		return wp;
	}

	@Override
	public void tick() {
		while (ZenthraClient.keys().addWaypoint.consumeClick()) {
			if (mc.player != null && Platform.screen() == null) {
				Platform.setScreen(new WaypointEditScreen(null, createHere("Repère " + (waypoints.size() + 1)), true));
			}
		}
	}

	public void add(Waypoint wp) {
		waypoints.add(wp);
		ZenthraClient.config().markDirty();
	}

	public void remove(Waypoint wp) {
		waypoints.remove(wp);
		ZenthraClient.config().markDirty();
	}

	public void captureMatrices(Matrix4f viewMatrix, Matrix4f projectionMatrix, Vec3 camera) {
		view.set(viewMatrix);
		projection.set(projectionMatrix);
		cameraPos = camera;
		haveMatrices = true;
	}

	public void renderHud(Gfx g) {
		if (!isEnabled() || !haveMatrices || mc.player == null || Platform.hudHidden()) return;
		int sw = mc.getWindow().getGuiScaledWidth();
		int sh = mc.getWindow().getGuiScaledHeight();
		for (Waypoint wp : waypoints) {
			if (!wp.visible || !belongsHere(wp)) continue;
			Vec3 target = new Vec3(wp.x + 0.5, wp.y + 1.0, wp.z + 0.5);
			double dist = mc.player.position().distanceTo(target);
			if (dist > maxDistance.get()) continue;
			Vector4f p = new Vector4f((float) (target.x - cameraPos.x), (float) (target.y - cameraPos.y), (float) (target.z - cameraPos.z), 1f);
			view.transform(p);
			projection.transform(p);
			if (p.w <= 0.05f) continue; // behind the camera
			float sx = (p.x / p.w * 0.5f + 0.5f) * sw;
			float sy = (1f - (p.y / p.w * 0.5f + 0.5f)) * sh;
			if (sx < -50 || sx > sw + 50 || sy < -20 || sy > sh + 20) continue;

			String text = showDistance.get() ? wp.name + " (" + Math.round(dist) + " m)" : wp.name;
			int w = Draw.font().width(text);
			int x = Math.round(sx - w / 2f);
			int y = Math.round(sy);
			g.fill(x - 4, y - 3, x + w + 4, y + 10, 0x90101014);
			g.fill(x - 4, y + 10, x + w + 4, y + 11, wp.color | 0xFF000000);
			g.text(text, x, y, 0xFFFFFFFF, true);
		}
	}

	public void loadWaypoints(JsonArray arr) {
		waypoints.clear();
		for (JsonElement el : arr) {
			if (!el.isJsonObject()) continue;
			JsonObject o = el.getAsJsonObject();
			try {
				Waypoint wp = new Waypoint(
					o.get("name").getAsString(),
					o.get("x").getAsInt(),
					o.get("y").getAsInt(),
					o.get("z").getAsInt(),
					o.has("dimension") ? o.get("dimension").getAsString() : "minecraft:overworld",
					parseColor(o.has("color") ? o.get("color").getAsString() : "#A855F7"));
				wp.visible = !o.has("visible") || o.get("visible").getAsBoolean();
				if (o.has("world") && o.get("world").isJsonPrimitive()) wp.world = o.get("world").getAsString();
				waypoints.add(wp);
			} catch (RuntimeException ignored) {
				// Skip malformed entries rather than losing the whole list.
			}
		}
	}

	public JsonArray saveWaypoints() {
		JsonArray arr = new JsonArray();
		for (Waypoint wp : waypoints) {
			JsonObject o = new JsonObject();
			o.addProperty("name", wp.name);
			o.addProperty("x", wp.x);
			o.addProperty("y", wp.y);
			o.addProperty("z", wp.z);
			o.addProperty("dimension", wp.dimension);
			o.addProperty("color", String.format("#%06X", wp.color & 0xFFFFFF));
			o.addProperty("visible", wp.visible);
			if (wp.world != null) o.addProperty("world", wp.world);
			arr.add(o);
		}
		return arr;
	}

	private static int parseColor(String s) {
		if (s.matches("#[0-9a-fA-F]{6}")) return 0xFF000000 | Integer.parseInt(s.substring(1), 16);
		return 0xFFA855F7;
	}
}
