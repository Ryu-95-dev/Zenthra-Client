package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.Draw;
import client.zenthra.compat.Gfx;

public class SessionTimerModule extends HudModule {
	private final long gameStart = System.currentTimeMillis();
	private long worldStart = -1;

	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting sinceWorld = add(new BooleanSetting("since_world", "Depuis l'entrée dans le monde", true));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public SessionTimerModule() {
		super("session_timer", "Session Timer", "Durée de la session de jeu en cours.", Category.UTILITY, false, 0.45, 0.07);
	}

	@Override
	public void tick() {
		if (mc.level == null) worldStart = -1;
		else if (worldStart < 0) worldStart = System.currentTimeMillis();
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		long start = sinceWorld.get() && worldStart > 0 ? worldStart : gameStart;
		long s = (System.currentTimeMillis() - start) / 1000;
		String text = String.format("%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60);
		int[] size = Draw.label(g, text, color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}
