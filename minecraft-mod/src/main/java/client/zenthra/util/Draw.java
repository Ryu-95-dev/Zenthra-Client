package client.zenthra.util;

import client.zenthra.compat.Gfx;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;

public final class Draw {
	public static final int BG = 0x90101014;

	private Draw() {}

	public static Font font() {
		return Minecraft.getInstance().font;
	}

	/** Draws a text label with optional dark background; returns its {width, height}. */
	public static int[] label(Gfx g, String text, int color, boolean background, boolean shadow) {
		int w = font().width(text) + (background ? 8 : 0);
		int h = background ? 14 : 9;
		if (background) g.fill(0, 0, w, h, BG);
		g.text(text, background ? 4 : 0, background ? 3 : 0, color, shadow);
		return new int[] {w, h};
	}

	public static int withAlpha(int argb, int alpha) {
		return (alpha & 0xFF) << 24 | (argb & 0xFFFFFF);
	}

	/** Linear interpolation between two ARGB colours. */
	public static int lerpColor(int a, int b, float t) {
		int aa = a >>> 24, ar = a >> 16 & 0xFF, ag = a >> 8 & 0xFF, ab = a & 0xFF;
		int ba = b >>> 24, br = b >> 16 & 0xFF, bg = b >> 8 & 0xFF, bb = b & 0xFF;
		return (int) (aa + (ba - aa) * t) << 24 | (int) (ar + (br - ar) * t) << 16 | (int) (ag + (bg - ag) * t) << 8 | (int) (ab + (bb - ab) * t);
	}
}
