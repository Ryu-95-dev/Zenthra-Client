package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;import java.util.Locale;

/** Horizontal speed of the player, in blocks per second. */
public class SpeedModule extends HudModule {
	private final ColorSetting color = add(new ColorSetting("color", "Couleur", 0xFFFFFFFF));
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));
	private double lastX, lastZ, speed;
	private boolean hasLast;

	public SpeedModule() {
		super("speed_display", "Vitesse", "Ta vitesse de déplacement en blocs par seconde.", Category.HUD, false, 0.45, 0.19);
	}

	@Override
	public void tick() {
		if (mc.player == null) {
			hasLast = false;
			return;
		}
		double x = mc.player.getX(), z = mc.player.getZ();
		if (hasLast) {
			double now = Math.sqrt((x - lastX) * (x - lastX) + (z - lastZ) * (z - lastZ)) * 20;
			speed = now > 100 ? speed : speed * 0.6 + now * 0.4; // ignore teleports
		}
		lastX = x;
		lastZ = z;
		hasLast = true;
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		int[] size = Draw.label(g, String.format(Locale.ROOT, "%.1f b/s", speed), color.get(), background.get(), true);
		width = size[0];
		height = size[1];
	}
}