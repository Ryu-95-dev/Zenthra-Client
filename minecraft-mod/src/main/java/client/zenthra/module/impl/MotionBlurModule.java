package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.NumberSetting;

/**
 * Light motion blur: a GPU post effect that blends each frame with the previous one
 * (assets/zenthra/post_effect, or shaders/post before 1.21.2). Not available on
 * 1.21.2–1.21.5, where Minecraft cannot keep the previous frame between passes.
 */
public class MotionBlurModule extends Module {
	private final NumberSetting strength = add(new NumberSetting("strength", "Intensité", 50, 20, 80, 15, " %"));

	public MotionBlurModule() {
		super("motion_blur", "Motion Blur", "Flou de mouvement léger calculé par la carte graphique.", Category.CAMERA, false);
	}

	@Override
	public String hint() {
		return Platform.motionBlurSupported()
			? "Effet GPU léger. Désactivé pendant que tu regardes à travers une créature (mode spectateur)."
			: "Indisponible sur cette version de Minecraft : elle ne garde pas l'image précédente entre deux effets.";
	}

	/** Strengths that have a shader file (motion_blur_<n>); the setting is mapped to the closest one. */
	private static final int[] LEVELS = {20, 35, 50, 65, 80};

	private int level() {
		int best = LEVELS[0];
		for (int l : LEVELS) if (Math.abs(l - strength.get()) < Math.abs(best - strength.get())) best = l;
		return best;
	}

	@Override
	public void tick() {
		if (mc.level != null && mc.player != null) Platform.motionBlur(level());
	}

	@Override
	protected void onDisable() {
		if (mc.gameRenderer != null) Platform.motionBlur(0);
	}
}