package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.CpsTracker;
import client.zenthra.util.Draw;
import client.zenthra.compat.Gfx;

public class CpsCounterModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));
	private final BooleanSetting showRight = add(new BooleanSetting("show_right", "Afficher le clic droit", true));

	public CpsCounterModule() {
		super("cps_counter", "CPS Counter", "Clics par seconde gauche et droit.", Category.HUD, false, 0.005, 0.05);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		String text = showRight.get() ? CpsTracker.left() + " | " + CpsTracker.right() + " CPS" : CpsTracker.left() + " CPS";
		int[] size = Draw.label(g, text, color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}
