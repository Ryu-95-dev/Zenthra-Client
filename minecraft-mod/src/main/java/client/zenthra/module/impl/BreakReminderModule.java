package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
/** Reminds the player to take a break after a chosen playing time. */
public class BreakReminderModule extends HudModule {
	private static final long SHOW_MS = 12_000;
	private final NumberSetting minutes = add(new NumberSetting("minutes", "Rappel toutes les", 60, 15, 180, 15, " min"));
	private final long startedAt = System.currentTimeMillis();
	private long lastShown = System.currentTimeMillis();

	public BreakReminderModule() {
		super("break_reminder", "Rappel de pause", "Te rappelle de faire une pause après un temps de jeu choisi.", Category.UTILITY, false, 0.20, 0.40);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		long now = System.currentTimeMillis();
		if (now - lastShown >= minutes.getInt() * 60_000L) lastShown = now;
		boolean visible = editing || (lastShown != startedAt && now - lastShown < SHOW_MS);
		long played = (now - startedAt) / 60_000;
		String text = "Tu joues depuis " + played + " min : pense à faire une pause !";
		width = Draw.font().width(text) + 12;
		height = 16;
		if (!visible) return;
		g.fill(0, 0, width, height, 0xC0261640);
		g.fill(0, height - 1, width, height, 0xFF8B5CF6);
		g.text(text, 6, 4, 0xFFF1EAFB, true);
	}
}