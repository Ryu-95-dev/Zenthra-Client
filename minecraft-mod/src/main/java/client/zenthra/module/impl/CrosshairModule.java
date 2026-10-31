package client.zenthra.module.impl;

import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import java.util.List;
import client.zenthra.compat.Gfx;
import client.zenthra.compat.Platform;
import net.minecraft.client.CameraType;

/** Replaces the vanilla crosshair (see GuiMixin) with a configurable one. */
public class CrosshairModule extends Module {
	private final ChoiceSetting style = add(new ChoiceSetting("style", "Style", List.of("cross", "dot", "circle", "x"), List.of("Croix", "Point", "Cercle", "Croix en X"), "cross"));
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final NumberSetting size = add(new NumberSetting("size", "Taille", 5, 1, 15, 1, " px"));
	private final NumberSetting thickness = add(new NumberSetting("thickness", "Épaisseur", 1, 1, 4, 1, " px"));
	private final NumberSetting gap = add(new NumberSetting("gap", "Écart central", 2, 0, 8, 1, " px"));
	private final BooleanSetting outline = add(new BooleanSetting("outline", "Contour noir", true));
	private final BooleanSetting centerDot = add(new BooleanSetting("center_dot", "Point central", false));

	public CrosshairModule() {
		super("crosshair", "Crosshair", "Viseur personnalisé : style, couleur, taille, épaisseur.", Category.PVP, false);
	}

	/** True when the vanilla crosshair should be replaced this frame. */
	public boolean shouldReplace() {
		return isEnabled() && mc.options.getCameraType() == CameraType.FIRST_PERSON && !Platform.debugScreenShown();
	}

	public void render(Gfx g) {
		renderAt(g, mc.getWindow().getGuiScaledWidth() / 2, mc.getWindow().getGuiScaledHeight() / 2);
	}

	/** Draws the crosshair centred on (cx, cy); also used for the live preview in the settings screen. */
	public void renderAt(Gfx g, int cx, int cy) {
		int s = size.getInt(), t = thickness.getInt(), gp = gap.getInt();
		int c = color.get();
		switch (style.get()) {
			case "dot" -> rect(g, cx - t, cy - t, cx + t, cy + t, c);
			case "circle" -> {
				int r = s + gp;
				for (int a = 0; a < 360; a += 10) {
					int x = cx + (int) Math.round(Math.cos(Math.toRadians(a)) * r);
					int y = cy + (int) Math.round(Math.sin(Math.toRadians(a)) * r);
					rect(g, x, y, x + t, y + t, c);
				}
			}
			case "x" -> {
				for (int i = gp; i < gp + s; i++) {
					rect(g, cx + i, cy + i, cx + i + t, cy + i + t, c);
					rect(g, cx - i - t, cy + i, cx - i, cy + i + t, c);
					rect(g, cx + i, cy - i - t, cx + i + t, cy - i, c);
					rect(g, cx - i - t, cy - i - t, cx - i, cy - i, c);
				}
			}
			default -> {
				int half = t / 2;
				rect(g, cx - half, cy - gp - s, cx - half + t, cy - gp, c);
				rect(g, cx - half, cy + gp + 1, cx - half + t, cy + gp + 1 + s, c);
				rect(g, cx - gp - s, cy - half, cx - gp, cy - half + t, c);
				rect(g, cx + gp + 1, cy - half, cx + gp + 1 + s, cy - half + t, c);
			}
		}
		if (centerDot.get() && !style.is("dot")) rect(g, cx, cy, cx + 1, cy + 1, c);
	}

	private void rect(Gfx g, int x1, int y1, int x2, int y2, int color) {
		if (outline.get()) g.fill(x1 - 1, y1 - 1, x2 + 1, y2 + 1, 0xC0000000);
		g.fill(x1, y1, x2, y2, color);
	}
}
