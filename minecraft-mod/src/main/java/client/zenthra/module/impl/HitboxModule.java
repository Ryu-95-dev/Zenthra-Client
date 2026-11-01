package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.module.Category;
import client.zenthra.module.Module;

/**
 * Shows entity hitboxes, exactly like Minecraft's own F3+B (nothing more is drawn).
 * The previous F3+B state is put back when the module is turned off.
 */
public class HitboxModule extends Module {
	private Boolean before;

	public HitboxModule() {
		super("hitbox", "Hitbox", "Affiche les hitbox des joueurs et entités (comme F3+B).", Category.PVP, false);
	}

	@Override
	public String hint() {
		return "Même affichage que le raccourci F3+B de Minecraft ; F3+B reste utilisable pendant que le module est actif.";
	}

	@Override
	protected void onEnable() {
		before = null; // applied on the next tick, once the game is ready
	}

	@Override
	public void tick() {
		if (before == null) {
			before = Platform.hitboxesShown();
			Platform.setHitboxesShown(true);
		}
	}

	@Override
	protected void onDisable() {
		if (before != null) Platform.setHitboxesShown(before);
		before = null;
	}
}