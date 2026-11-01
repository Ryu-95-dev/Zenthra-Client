package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;

/**
 * Recolours the "hurt" tint applied to entities by rewriting the red half of
 * the vanilla overlay texture (same layout as OverlayTexture's constructor).
 */
public class HitColorModule extends Module {
	private static final int VANILLA = 0xB2FF0000;

	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFA855F7));
	private final NumberSetting opacity = add(new NumberSetting("opacity", "Intensité", 0.7, 0.1, 1.0, 0.05, ""));
	private final BooleanSetting armor = add(new BooleanSetting("armor", "Colorer aussi l'armure", true));

	public boolean tintsArmor() {
		return armor.get();
	}

	public HitColorModule() {
		super("hit_color", "Hit Color", "Couleur de l'indicateur de coup sur les entités.", Category.PVP, true);
	}

	@Override
	protected void onEnable() {
		apply();
	}

	@Override
	protected void onDisable() {
		Platform.setHurtOverlayColor(VANILLA);
	}

	@Override
	public void onSettingsChanged() {
		if (isEnabled()) apply();
	}

	private void apply() {
		int alpha = (int) Math.round(opacity.get() * 255);
		Platform.setHurtOverlayColor(alpha << 24 | (color.get() & 0xFFFFFF));
	}
}