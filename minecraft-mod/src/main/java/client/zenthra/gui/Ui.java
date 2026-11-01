package client.zenthra.gui;

import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import client.zenthra.compat.SkinInfo;
import client.zenthra.util.Draw;

/** Drawing helpers shared by the Zenthra screens: glass panels, icons, switches. */
public final class Ui {
	public static final int TEXT = 0xFFF1EAFB;
	public static final int MUTED = 0xFFA898BF;
	public static final int ACCENT = 0xFF8B5CF6;
	public static final int ACCENT_LIGHT = 0xFFC9B0F5;
	public static final int GLASS = 0xB0120A1E;
	public static final int GLASS_LIGHT = 0x8C1E1430;
	public static final int GLASS_HOVER = 0xB02A1A45;
	public static final int BORDER = 0x40B48AE8;
	public static final int BORDER_HOVER = 0xD0D2B4FF;
	public static final int GREEN = 0xFF3DDC84;

	private static Object icons;
	private static Object background;

	private Ui() {}

	public static Object iconTexture() {
		if (icons == null) icons = Platform.texture("textures/gui/icons.png");
		return icons;
	}

	public static Object backgroundTexture() {
		if (background == null) background = Platform.texture("textures/gui/menu_background.png");
		return background;
	}

	/** Icon of the atlas, `size` pixels square; white when `bright`. */
	public static void icon(Gfx g, ZIcon icon, int x, int y, int size, boolean bright) {
		int i = icon.ordinal();
		int u = (i % ZIcon.COLUMNS) * ZIcon.CELL;
		int v = (i / ZIcon.COLUMNS + (bright ? ZIcon.ROWS : 0)) * ZIcon.CELL;
		g.texture(iconTexture(), x, y, size, size, u, v, ZIcon.CELL, ZIcon.CELL, ZIcon.TEXTURE_WIDTH, ZIcon.TEXTURE_HEIGHT);
	}

	/** Rectangle with 2-pixel rounded corners. */
	public static void round(Gfx g, int x, int y, int w, int h, int argb) {
		g.fill(x + 2, y, x + w - 2, y + 1, argb);
		g.fill(x + 1, y + 1, x + w - 1, y + 2, argb);
		g.fill(x, y + 2, x + w, y + h - 2, argb);
		g.fill(x + 1, y + h - 2, x + w - 1, y + h - 1, argb);
		g.fill(x + 2, y + h - 1, x + w - 2, y + h, argb);
	}

	public static void roundOutline(Gfx g, int x, int y, int w, int h, int argb) {
		g.fill(x + 2, y, x + w - 2, y + 1, argb);
		g.fill(x + 2, y + h - 1, x + w - 2, y + h, argb);
		g.fill(x, y + 2, x + 1, y + h - 2, argb);
		g.fill(x + w - 1, y + 2, x + w, y + h - 2, argb);
		g.fill(x + 1, y + 1, x + 2, y + 2, argb);
		g.fill(x + w - 2, y + 1, x + w - 1, y + 2, argb);
		g.fill(x + 1, y + h - 2, x + 2, y + h - 1, argb);
		g.fill(x + w - 2, y + h - 2, x + w - 1, y + h - 1, argb);
	}

	/** Translucent "glass" panel: body, top reflection, thin border and a glow when hovered. */
	public static void glass(Gfx g, int x, int y, int w, int h, int body, float hover) {
		if (hover > 0.02f) roundOutline(g, x - 1, y - 1, w + 2, h + 2, alpha(0x70, hover) | 0xB890FF);
		round(g, x, y, w, h, body);
		g.fill(x + 3, y + 1, x + w - 3, y + 2, 0x1EFFFFFF);
		g.fill(x + 1, y + 2, x + w - 1, y + Math.min(h - 2, 2 + h / 3), 0x08FFFFFF);
		roundOutline(g, x, y, w, h, Draw.lerpColor(BORDER, BORDER_HOVER, hover));
	}

	/** Animated on/off switch, 20×10; `t` goes from 0 (off) to 1 (on). */
	public static void toggle(Gfx g, int x, int y, float t) {
		round(g, x, y, 20, 10, Draw.lerpColor(0xFF3A3346, ACCENT, t));
		if (t > 0.5f) roundOutline(g, x - 1, y - 1, 22, 12, alpha(0x50, (t - 0.5f) * 2) | 0xB890FF);
		int kx = x + 1 + Math.round(10 * t);
		round(g, kx, y + 1, 8, 8, 0xFFFFFFFF);
	}

	/** Small pill with a coloured dot and text; returns its width. */
	public static int pill(Gfx g, int rightX, int y, String text, int dot) {
		int w = Draw.font().width(text) + 18;
		int x = rightX - w;
		round(g, x, y, w, 14, 0x90120A1E);
		roundOutline(g, x, y, w, 14, BORDER);
		g.fill(x + 6, y + 5, x + 10, y + 9, dot);
		g.text(text, x + 13, y + 3, TEXT, false);
		return w;
	}

	/** Face of the player's skin (with the hat layer), `size` pixels square. */
	public static void face(Gfx g, int x, int y, int size) {
		SkinInfo skin = Platform.playerSkin();
		if (skin == null || skin.texture() == null) return;
		g.texture(skin.texture(), x, y, size, size, 8, 8, 8, 8, 64, 64);
		g.texture(skin.texture(), x, y, size, size, 40, 8, 8, 8, 64, 64);
	}

	public static int alpha(int max, float f) {
		return Math.max(0, Math.min(255, Math.round(max * f))) << 24;
	}

	/** Eases `v` towards `target`; instant when animations are off. */
	public static float approach(float v, float target, boolean animate) {
		return animate ? v + (target - v) * 0.25f : target;
	}

	public static boolean inside(double mx, double my, int x, int y, int w, int h) {
		return mx >= x && mx < x + w && my >= y && my < y + h;
	}

	/** Text cut to `width` with an ellipsis. */
	public static String fit(String text, int width) {
		var font = Draw.font();
		if (font.width(text) <= width) return text;
		return font.plainSubstrByWidth(text, Math.max(0, width - font.width("…"))) + "…";
	}

	/** Splits text into at most `lines` lines of `width` pixels (the last one ends with … if needed). */
	public static String[] wrap(String text, int width, int lines) {
		var font = Draw.font();
		java.util.List<String> out = new java.util.ArrayList<>();
		String rest = text.trim();
		while (!rest.isEmpty() && out.size() < lines) {
			if (out.size() == lines - 1 || font.width(rest) <= width) {
				out.add(fit(rest, width));
				break;
			}
			String part = font.plainSubstrByWidth(rest, width);
			int space = part.lastIndexOf(' ');
			if (space > 0 && space < part.length()) part = part.substring(0, space);
			out.add(part);
			rest = rest.substring(part.length()).trim();
		}
		return out.toArray(new String[0]);
	}
}
