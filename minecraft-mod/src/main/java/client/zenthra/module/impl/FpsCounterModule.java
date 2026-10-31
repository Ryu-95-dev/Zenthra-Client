package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.Draw;
import client.zenthra.compat.Gfx;

public class FpsCounterModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));
	private final BooleanSetting shadow = add(new BooleanSetting("shadow", "Ombre du texte", true));

	public FpsCounterModule() {
		super("fps_counter", "FPS Counter", "Images par seconde réelles du jeu.", Category.HUD, true, 0.005, 0.01);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		int[] size = Draw.label(g, mc.getFps() + " FPS", color.get(), background.get(), shadow.get());
		width = size[0];
		height = size[1];
	}
}
