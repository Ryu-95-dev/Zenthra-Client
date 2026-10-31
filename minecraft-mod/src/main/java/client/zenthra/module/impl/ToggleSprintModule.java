package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.ZenthraClient;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;

/**
 * Keeps the vanilla sprint key held, exactly as if the player held it:
 * the game itself still decides when sprinting is possible (hunger, blocking,
 * collisions…). No movement is automated beyond that.
 */
public class ToggleSprintModule extends Module {
	private final BooleanSetting showStatus = add(new BooleanSetting("show_status", "Indiquer l'état à l'écran", true));
	private boolean active = true;

	/** True while the module keeps the sprint key held (not toggled off by the player). */
	public boolean isSprintHeld() {
		return active;
	}

	public ToggleSprintModule() {
		super("toggle_sprint", "Toggle Sprint", "Sprint maintenu sans garder la touche enfoncée.", Category.PVP, false);
	}

	@Override
	public String hint() {
		return "Touche de bascule : Options → Commandes → Zenthra.";
	}

	@Override
	public void tick() {
		while (ZenthraClient.keys().toggleSprint.consumeClick()) {
			active = !active;
			if (!active) mc.options.keySprint.setDown(false);
		}
		if (active && mc.player != null && Platform.screen() == null) mc.options.keySprint.setDown(true);
	}

	@Override
	protected void onDisable() {
		mc.options.keySprint.setDown(false);
	}

	public String status() {
		return isEnabled() && showStatus.get() ? (active ? "Sprint : activé" : "Sprint : désactivé") : null;
	}
}
