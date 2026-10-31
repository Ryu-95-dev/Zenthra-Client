package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.ZenthraClient;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.NumberSetting;
import net.minecraft.util.Mth;

/** Hold-to-zoom with smooth transition; the FOV is scaled in GameRendererMixin. */
public class ZoomModule extends Module {
	private final NumberSetting factor = add(new NumberSetting("factor", "Niveau de zoom", 4, 1.5, 15, 0.5, "x"));
	private final BooleanSetting scroll = add(new BooleanSetting("scroll", "Molette pour ajuster", true));
	private final BooleanSetting smooth = add(new BooleanSetting("smooth", "Transition fluide", true));
	private final BooleanSetting cinematic = add(new BooleanSetting("cinematic", "Caméra cinématique pendant le zoom", false));

	private double scrollFactor;
	private double current = 1;
	private long lastFrame = System.nanoTime();
	private boolean wasZooming;
	private boolean savedSmoothCamera;

	public ZoomModule() {
		super("zoom", "Zoom", "Zoom réglable avec retour fluide au champ de vision.", Category.CAMERA, true);
	}

	@Override
	public String hint() {
		return "Maintenir la touche Zoom (C par défaut).";
	}

	public boolean isZooming() {
		return isEnabled() && Platform.screen() == null && ZenthraClient.keys().zoom.isDown();
	}

	/** Current zoom level; the scroll-adjusted value is reset whenever zooming stops. */
	/** Current zoom level (×), including mouse-wheel adjustments. */
	public double currentLevel() {
		return level();
	}

	private double level() {
		return scrollFactor > 0 ? scrollFactor : factor.get();
	}

	@Override
	public void tick() {
		boolean zooming = isZooming();
		if (!zooming) scrollFactor = 0;
		if (zooming && !wasZooming) {
			savedSmoothCamera = mc.options.smoothCamera;
			if (cinematic.get()) mc.options.smoothCamera = true;
		} else if (!zooming && wasZooming && cinematic.get()) {
			mc.options.smoothCamera = savedSmoothCamera;
		}
		wasZooming = zooming;
	}

	/** Returns true if the scroll was consumed to change the zoom level. */
	public boolean onScroll(double amount) {
		if (!isZooming() || !scroll.get()) return false;
		scrollFactor = Mth.clamp(level() * (amount > 0 ? 1.15 : 1 / 1.15), factor.min(), 50);
		return true;
	}

	/** Multiplier applied to the FOV, interpolated every frame. */
	public double fovMultiplier() {
		long now = System.nanoTime();
		double dt = Math.min(0.1, (now - lastFrame) / 1e9);
		lastFrame = now;
		double target = isZooming() ? 1.0 / level() : 1.0;
		if (!smooth.get()) current = target;
		else current += (target - current) * (1 - Math.exp(-dt * 14));
		if (Math.abs(current - target) < 1e-3) current = target;
		// Never hand the renderer a degenerate FOV: vanilla frustum code loops forever on it.
		if (!Double.isFinite(current)) current = 1.0;
		current = Mth.clamp(current, 1.0 / 50, 1.0);
		return current;
	}

	@Override
	protected void onDisable() {
		current = 1;
	}
}
