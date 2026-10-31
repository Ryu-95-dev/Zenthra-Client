package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.util.CpsTracker;
import client.zenthra.util.Draw;
import net.minecraft.client.KeyMapping;
import client.zenthra.compat.Gfx;

public class KeystrokesModule extends HudModule {
	private static final int KEY = 22;
	private static final int GAP = 2;

	private final ColorSetting textColor = add(new ColorSetting("text_color", "Couleur du texte", 0xFFFFFFFF));
	private final ColorSetting pressedColor = add(new ColorSetting("pressed_color", "Couleur appuyée", 0xFFA855F7));
	private final BooleanSetting showMouse = add(new BooleanSetting("show_mouse", "Clics souris", true));
	private final BooleanSetting showCps = add(new BooleanSetting("show_cps", "CPS sous les clics", true));
	private final BooleanSetting showSpace = add(new BooleanSetting("show_space", "Barre d'espace", true));

	private final float[] fade = new float[7];

	public KeystrokesModule() {
		super("keystrokes", "Keystrokes", "Touches WASD, clics et CPS à l'écran.", Category.HUD, true, 0.005, 0.14);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		var o = mc.options;
		int full = KEY * 3 + GAP * 2;
		key(g, 0, KEY + GAP, 0, KEY, KEY, o.keyUp, label(o.keyUp));
		key(g, 1, 0, KEY + GAP, KEY, KEY, o.keyLeft, label(o.keyLeft));
		key(g, 2, KEY + GAP, KEY + GAP, KEY, KEY, o.keyDown, label(o.keyDown));
		key(g, 3, (KEY + GAP) * 2, KEY + GAP, KEY, KEY, o.keyRight, label(o.keyRight));
		int y = (KEY + GAP) * 2;
		if (showMouse.get()) {
			int half = (full - GAP) / 2;
			String l = showCps.get() ? CpsTracker.left() + " CPS" : "LMB";
			String r = showCps.get() ? CpsTracker.right() + " CPS" : "RMB";
			key(g, 4, 0, y, half, KEY, o.keyAttack, l);
			key(g, 5, half + GAP, y, half, KEY, o.keyUse, r);
			y += KEY + GAP;
		}
		if (showSpace.get()) {
			key(g, 6, 0, y, full, 12, o.keyJump, "—");
			y += 12 + GAP;
		}
		width = full;
		height = y - GAP;
	}

	private void key(Gfx g, int idx, int x, int y, int w, int h, KeyMapping mapping, String text) {
		float target = mapping.isDown() ? 1f : 0f;
		fade[idx] += (target - fade[idx]) * 0.35f;
		int bg = Draw.lerpColor(Draw.BG, Draw.withAlpha(pressedColor.get(), 0xC0), fade[idx]);
		g.fill(x, y, x + w, y + h, bg);
		var font = Draw.font();
		g.text(text, x + (w - font.width(text)) / 2, y + (h - 8) / 2, textColor.get(), true);
	}

	private static String label(KeyMapping k) {
		String s = k.getTranslatedKeyMessage().getString();
		return s.length() > 3 ? s.substring(0, 3) : s.toUpperCase();
	}
}
