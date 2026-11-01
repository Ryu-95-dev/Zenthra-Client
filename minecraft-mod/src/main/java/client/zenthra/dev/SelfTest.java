package client.zenthra.dev;

import client.zenthra.ZenthraClient;
import client.zenthra.gui.ZenthraScreen;
import client.zenthra.gui.FriendsScreen;
import client.zenthra.gui.HudEditorScreen;
import client.zenthra.gui.ZenthraTitleScreen;
import client.zenthra.gui.ModuleSettingsScreen;
import client.zenthra.gui.WaypointsScreen;
import client.zenthra.module.Module;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.CpsCounterModule;
import client.zenthra.module.impl.DirectionHudModule;
import client.zenthra.module.impl.WaypointsModule;
import client.zenthra.module.impl.ScoreboardModule;
import client.zenthra.module.impl.ToggleSprintModule;
import client.zenthra.compat.Platform;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.server.level.ServerPlayer;
/**
 * Development-only automated walkthrough, enabled with -Dzenthra.selftest=true.
 * Enters the demo world, opens every Zenthra screen and exercises the camera
 * modules, saving a vanilla screenshot at each step, then quits the game.
 */
public final class SelfTest {
	private record Step(int delay, String name, Runnable action) {}

	private final List<Step> steps = new ArrayList<>();
	private int index = -1;
	private int wait;
	private String pendingShot;
	private boolean started;
	private int idleTicks;
	private int menuTicks;

	public static void installIfEnabled() {
		if (Boolean.getBoolean("zenthra.selftest")) new SelfTest().install();
	}

	private static void log(String msg) {
		ZenthraClient.LOGGER.info("[selftest] {}", msg);
	}

	private void install() {
		Minecraft mc = Minecraft.getInstance();
		var keys = ZenthraClient.keys();
		// Make every HUD element visible for the capture.
		steps.add(new Step(0, null, () -> {
			// The test window is usually in the background: don't let the game pause itself (test profile only).
			mc.options.pauseOnLostFocus = false;
			for (Module m : ZenthraClient.modules().all()) {
				if (m instanceof CpsCounterModule || m instanceof DirectionHudModule || m instanceof CrosshairModule
					|| m instanceof client.zenthra.module.impl.StatusIndicatorsModule) m.setEnabled(true);
			}
			Platform.setScreen(null);
		}));
		steps.add(new Step(60, "01-hud", () -> {}));
		// A late first-launch window (demo intro on some versions) would hide the pause menu: close it first.
		steps.add(new Step(5, null, () -> {
			Platform.setScreen(null);
			mc.pauseGame(false);
		}));
		steps.add(new Step(20, "02-pause-menu", () -> {
			boolean found = Platform.screen() instanceof PauseScreen && Platform.buttonsOf(Platform.screen()).stream()
				.anyMatch(w -> w.getMessage().getString().equals(I18n.get(ZenthraScreen.TITLE_KEY)));
			log("bouton « " + I18n.get(ZenthraScreen.TITLE_KEY) + " » présent dans le menu pause : " + found);
		}));
		steps.add(new Step(5, null, () -> pressButton(mc, I18n.get(ZenthraScreen.TITLE_KEY))));
		steps.add(new Step(20, "03-zenthra-mods", () -> log("écran ouvert : " + name(mc))));
		steps.add(new Step(5, null, () -> Platform.setScreen(new ModuleSettingsScreen(Platform.screen(), ZenthraClient.modules().get(CrosshairModule.class)))));
		steps.add(new Step(20, "04-module-settings", () -> log("écran ouvert : " + name(mc))));
		steps.add(new Step(5, null, () -> Platform.setScreen(new ZenthraScreen(null).showDiagnostic())));
		steps.add(new Step(40, "04b-diagnostic", () -> log("télémétrie écrite : " + java.nio.file.Files.exists(
			net.fabricmc.loader.api.FabricLoader.getInstance().getGameDir().resolve("zenthra").resolve("telemetry.json")))));
		steps.add(new Step(5, null, () -> Platform.setScreen(new HudEditorScreen(new ZenthraScreen(null)))));
		steps.add(new Step(20, "05-hud-editor", () -> log("écran ouvert : " + name(mc))));
		steps.add(new Step(5, null, () -> {
			WaypointsModule wp = ZenthraClient.modules().get(WaypointsModule.class);
			var p = mc.player;
			var marked = new WaypointsModule.Waypoint("Maison", p.getBlockX() - (int) (-Math.sin(Math.toRadians(p.getYRot())) * 20), p.getBlockY() + 2, p.getBlockZ() - (int) (Math.cos(Math.toRadians(p.getYRot())) * 20), wp.currentDimension(), 0xFF22C55E);
			marked.icon = "house";
			wp.add(marked);
			wp.add(new WaypointsModule.Waypoint("Test", p.getBlockX() + (int) (-Math.sin(Math.toRadians(p.getYRot())) * 12), p.getBlockY(), p.getBlockZ() + (int) (Math.cos(Math.toRadians(p.getYRot())) * 12), wp.currentDimension(), 0xFFA855F7));
			Platform.setScreen(new WaypointsScreen(null));
		}));
		steps.add(new Step(20, "06-waypoints-screen", () -> {}));
		steps.add(new Step(5, null, () -> Platform.setScreen(null)));
		steps.add(new Step(30, "07-waypoint-in-world", () -> {}));
		steps.add(new Step(2, null, () -> keys.zoom.setDown(true)));
		steps.add(new Step(30, "08-zoom", () -> {
			log(String.format("zoom : FOV=%.1f (normal %d)", mc.options.fov().get() * ZenthraClient.modules().get(client.zenthra.module.impl.ZoomModule.class).fovMultiplier(), mc.options.fov().get()));
			keys.zoom.setDown(false);
		}));
		steps.add(new Step(20, null, () -> keys.freelook.setDown(true)));
		steps.add(new Step(5, null, () -> {
			var fl = ZenthraClient.modules().get(client.zenthra.module.impl.FreeLookModule.class);
			float player = mc.player.getYRot(), camera = fl.yaw();
			mc.player.turn(1200, 0); // +180° of mouse movement
			log(String.format("free look actif=%s · joueur %.1f→%.1f · caméra %.1f→%.1f",
				fl.isActive(), player, mc.player.getYRot(), camera, fl.yaw()));
		}));
		steps.add(new Step(20, "09-freelook", () -> {}));
		steps.add(new Step(5, null, () -> keys.freelook.setDown(false)));
		steps.add(new Step(20, "10-after-freelook", () -> {}));

		// Armor HUD + Potion HUD with real equipment and effects (given by the integrated server).
		steps.add(new Step(5, null, () -> onServer(mc, Platform::testGiveGear)));
		steps.add(new Step(20, "11-armor-potions", () -> log("effets actifs côté client : " + mc.player.getActiveEffects().size())));

		// Hit Color: hurt the player and look at it from the front.
		steps.add(new Step(5, null, () -> mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT)));
		steps.add(new Step(15, null, () -> onServer(mc, Platform::testHurt)));
		steps.add(new Step(3, "12-hit-color", () -> log("hurtTime=" + mc.player.hurtTime)));
		steps.add(new Step(15, null, () -> mc.options.setCameraType(CameraType.FIRST_PERSON)));

		// Toggle Sprint: walk forward without pressing the sprint key.
		// Done in mid-air (slow falling) so that no block collision cancels the sprint.
		steps.add(new Step(5, null, () -> onServer(mc, Platform::testLiftWithSlowFalling)));
		steps.add(new Step(10, null, () -> {
			ZenthraClient.modules().get(ToggleSprintModule.class).setEnabled(true);
			mc.options.keyUp.setDown(true);
		}));
		for (int i = 1; i <= 3; i++) {
			int n = i;
			steps.add(new Step(10, null, () -> log(String.format("toggle sprint t+%d : sprint=%s touche sprint=%s avance=%.2f collision=%s écran=%s",
				n * 10, mc.player.isSprinting(), mc.options.keySprint.isDown(), Platform.forwardImpulse(mc.player), mc.player.horizontalCollision, name(mc)))));
		}
		steps.add(new Step(2, null, () -> mc.options.keyUp.setDown(false)));

		// Scoreboard: vanilla sidebar, then scaled and moved by the module.
		steps.add(new Step(10, null, () -> onServer(mc, sp -> Platform.testScoreboard(mc.getSingleplayerServer()))));
		steps.add(new Step(20, "13-scoreboard-vanilla", () -> {
			ScoreboardModule sb = ZenthraClient.modules().get(ScoreboardModule.class);
			sb.setEnabled(true);
			sb.scale.set(0.7);
			sb.offsetY.set(-40.0);
		}));
		steps.add(new Step(10, "14-scoreboard-zenthra", () -> {}));

		// Hot reload: the launcher disables the FPS counter while the game runs.
		steps.add(new Step(5, null, () -> log("attente launcher : désactivation de fps_counter")));
		steps.add(new Step(120, "15-after-reload", () -> log("rechargement à chaud : fps_counter activé="
			+ ZenthraClient.modules().get(client.zenthra.module.impl.FpsCounterModule.class).isEnabled() + " (attendu false)")));
		// New HUD modules (inventory, totems, ping, day, clock, speed, memory, Nether coordinates, durability).
		steps.add(new Step(5, null, () -> {
			for (Module m : ZenthraClient.modules().all()) {
				if (java.util.Set.of("inventory_hud", "totem_counter", "ping_display", "day_counter", "clock", "speed_display", "memory_display", "nether_coords", "durability_alert", "hitbox").contains(m.id())) m.setEnabled(true);
			}
		}));
		steps.add(new Step(20, "16-new-modules", () -> log("nouveaux modules affichés")));
		// Optimisation module: turns options down, then restores them exactly.
		steps.add(new Step(5, null, () -> {
			log(String.format("optimisation avant : particules=%d entités=%.2f ombres=%s", Platform.particlesLevel(), mc.options.entityDistanceScaling().get(), mc.options.entityShadows().get()));
			ZenthraClient.modules().get(client.zenthra.module.impl.OptimizationModule.class).setEnabled(true);
		}));
		steps.add(new Step(5, null, () -> log(String.format("optimisation active : particules=%d entités=%.2f ombres=%s", Platform.particlesLevel(), mc.options.entityDistanceScaling().get(), mc.options.entityShadows().get()))));
		steps.add(new Step(5, null, () -> {
			ZenthraClient.modules().get(client.zenthra.module.impl.OptimizationModule.class).setEnabled(false);
			log(String.format("optimisation coupée : particules=%d entités=%.2f ombres=%s", Platform.particlesLevel(), mc.options.entityDistanceScaling().get(), mc.options.entityShadows().get()));
		}));
		// Motion blur: GPU post effect (not available on 1.21.2–1.21.5).
		steps.add(new Step(5, null, () -> ZenthraClient.modules().get(client.zenthra.module.impl.MotionBlurModule.class).setEnabled(true)));
		steps.add(new Step(10, null, () -> mc.player.turn(400, 0)));
		steps.add(new Step(2, "17-motion-blur", () -> log("motion blur : supporté=" + Platform.motionBlurSupported())));
		steps.add(new Step(10, null, () -> ZenthraClient.modules().get(client.zenthra.module.impl.MotionBlurModule.class).setEnabled(false)));
		steps.add(new Step(10, null, () -> {
			log("terminé");
			mc.stop();
		}));

		ClientTickEvents.END_CLIENT_TICK.register(this::tick);
		log("activé");
	}

	private void tick(Minecraft mc) {
		if (pendingShot != null) {
			String n = pendingShot;
			pendingShot = null;
			Platform.screenshot("zenthra-" + n + ".png", f -> log("capture " + n));
		}
		if (!started) {
			// A fresh instance can open a first-launch screen (accessibility onboarding)
			// instead of the title screen: report it and move on to the title screen.
			if (++idleTicks % 100 == 0) {
				log("en attente de l'écran titre · écran=" + name(mc) + " · overlay=" + (Platform.loadingOverlay()));
				if (!Platform.loadingOverlay() && !Platform.isTitleScreen(Platform.screen()) && !(Platform.screen() instanceof ZenthraTitleScreen)
					&& !(Platform.screen() instanceof FriendsScreen)) Platform.setScreen(Platform.titleScreen());
			}
			// Zenthra main menu: capture it and its friends screen, then "Solo" (the demo world).
			if (Platform.screen() instanceof ZenthraTitleScreen menu && !Platform.loadingOverlay()) {
				if (++menuTicks == 1) log("menu principal Zenthra affiché");
				if (menuTicks == 40) {
					pendingShot = "00-main-menu";
					log("menu principal : joueur=" + Platform.playerName() + " · skin=" + (Platform.playerSkin() != null));
				}
				if (menuTicks == 50) menu.openFriends();
				if (menuTicks == 90) {
					started = true;
					wait = 40;
					log("menu principal : bouton Solo (monde démo)");
					menu.playSolo();
				}
				return;
			}
			if (Platform.screen() instanceof FriendsScreen) {
				if (++menuTicks == 70) pendingShot = "00b-friends";
				if (menuTicks == 80) Platform.setScreen(new ZenthraTitleScreen());
				return;
			}
			if (Platform.isTitleScreen(Platform.screen()) && !Platform.loadingOverlay()) {
				started = true;
				wait = 40;
				log("écran titre atteint, lancement du monde démo");
				pressTranslated(Platform.screen(), "menu.playdemo");
			}
			return;
		}
		if (index < 0) {
			if (mc.level == null || mc.player == null) return;
			index = 0;
			wait = 100; // let chunks load
			log("monde chargé");
		}
		if (index >= steps.size() || --wait > 0) return;
		Step s = steps.get(index++);
		log("étape " + index + "/" + steps.size() + (s.name() != null ? " " + s.name() : "") + " · écran=" + name(mc));
		try {
			s.action().run();
		} catch (RuntimeException e) {
			ZenthraClient.LOGGER.error("[selftest] étape échouée", e);
		}
		if (s.name() != null) pendingShot = s.name();
		if (index < steps.size()) wait = steps.get(index).delay();
	}

	/** Runs an action on the integrated server for the local player. */
	private static void onServer(Minecraft mc, Consumer<ServerPlayer> action) {
		var server = mc.getSingleplayerServer();
		if (server == null) {
			log("pas de serveur intégré");
			return;
		}
		var uuid = mc.player.getUUID();
		server.execute(() -> {
			ServerPlayer sp = server.getPlayerList().getPlayer(uuid);
			if (sp != null) action.accept(sp);
		});
	}

	private static String name(Minecraft mc) {
		return Platform.screen() == null ? "aucun" : Platform.screen().getClass().getSimpleName();
	}

	private static void pressButton(Minecraft mc, String label) {
		for (Button b : Platform.buttonsOf(Platform.screen())) {
			if (b.getMessage().getString().equals(label)) {
				Platform.press(b);
				return;
			}
		}
		log("bouton introuvable : " + label);
	}

	private static void pressTranslated(Screen screen, String key) {
		for (Button b : Platform.buttonsOf(screen)) {
			if (Platform.hasTranslationKey(b.getMessage(), key)) {
				Platform.press(b);
				return;
			}
		}
		log("bouton introuvable : " + key);
	}
}
