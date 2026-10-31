package client.zenthra;

import client.zenthra.compat.Platform;
import client.zenthra.config.ConfigManager;
import client.zenthra.dev.SelfTest;
import client.zenthra.diag.Telemetry;
import client.zenthra.gui.ZenthraScreen;
import client.zenthra.gui.HudEditorScreen;
import client.zenthra.module.HudModule;
import client.zenthra.module.Module;
import client.zenthra.module.ModuleManager;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.HitColorModule;
import client.zenthra.module.impl.ToggleSprintModule;
import client.zenthra.module.impl.WaypointsModule;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ZenthraClient implements ClientModInitializer {
	public static final Logger LOGGER = LoggerFactory.getLogger("Zenthra");

	private static ModuleManager modules;
	private static ConfigManager config;
	private static Keybinds keys;
	private static final Telemetry TELEMETRY = new Telemetry();

	public static Telemetry telemetry() {
		return TELEMETRY;
	}

	public static ModuleManager modules() {
		return modules;
	}

	public static ConfigManager config() {
		return config;
	}

	public static Keybinds keys() {
		return keys;
	}

	@Override
	public void onInitializeClient() {
		keys = new Keybinds();
		modules = new ModuleManager();
		config = new ConfigManager(modules);
		config.load();

		// Textures (hit colour) only exist once the client has started.
		ClientLifecycleEvents.CLIENT_STARTED.register(client -> {
			modules.get(HitColorModule.class).onSettingsChanged();
			TELEMETRY.markStarted();
		});
		ClientLifecycleEvents.CLIENT_STOPPING.register(client -> config.save());

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			for (Module m : modules.all()) if (m.isEnabled()) m.tick();
			while (keys.openMenu.consumeClick()) {
				if (Platform.screen() == null) Platform.setScreen(new ZenthraScreen(null));
			}
			config.tick();
			TELEMETRY.tick(client);
		});

		Platform.registerHud((g, partialTick) -> {
			Minecraft mc = Minecraft.getInstance();
			if (Platform.hudHidden() || Platform.debugScreenShown() || Platform.screen() instanceof HudEditorScreen) return;
			CrosshairModule crosshair = modules.get(CrosshairModule.class);
			if (crosshair.shouldReplace()) crosshair.render(g);
			modules.get(WaypointsModule.class).renderHud(g);
			for (HudModule m : modules.hud()) if (m.isEnabled()) m.render(g, partialTick, false);
			String sprint = modules.get(ToggleSprintModule.class).status();
			if (sprint != null) g.text(sprint, 4, mc.getWindow().getGuiScaledHeight() - 12, 0xFFB9B5C9, true);
		});

		Platform.registerWorldFrame((view, projection, camera) -> {
			modules.get(WaypointsModule.class).captureMatrices(view, projection, camera);
			TELEMETRY.onFrame();
		});

		// "Modules Zenthra" / "Zenthra Skills" button (follows the game language) in the pause menu, under the existing buttons.
		Platform.installPauseButton(() -> Component.translatable(ZenthraScreen.TITLE_KEY), ZenthraScreen::new);

		SelfTest.installIfEnabled();
		LOGGER.info("Zenthra Client chargé ({} modules).", modules.all().size());
	}
}
