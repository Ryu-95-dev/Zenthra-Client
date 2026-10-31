package client.zenthra.module;

import client.zenthra.module.setting.NumberSetting;
import com.google.gson.JsonObject;
import client.zenthra.compat.Gfx;

/**
 * A module drawing an element on the HUD. Its position is stored as a
 * fraction of the scaled screen so it survives window resizes.
 */
public abstract class HudModule extends Module {
	private double x;
	private double y;
	private final double defaultX;
	private final double defaultY;
	protected final NumberSetting scale = add(new NumberSetting("scale", "Échelle", 1.0, 0.5, 2.0, 0.05, "x"));

	/** Size of the last drawn element, in unscaled GUI pixels. */
	protected int width = 40;
	protected int height = 12;

	protected HudModule(String id, String name, String description, Category category, boolean defaultEnabled, double defaultX, double defaultY) {
		super(id, name, description, category, defaultEnabled);
		this.x = this.defaultX = defaultX;
		this.y = this.defaultY = defaultY;
	}

	/** Draws the element at (0,0); the caller applies position and scale. Returns nothing, but must update width/height. */
	protected abstract void renderElement(Gfx g, float partialTick, boolean editing);

	public final void render(Gfx g, float partialTick, boolean editing) {
		int sw = mc.getWindow().getGuiScaledWidth();
		int sh = mc.getWindow().getGuiScaledHeight();
		float s = scale.getFloat();
		g.push();
		g.translate(screenX(sw, s), screenY(sh, s));
		g.scale(s);
		renderElement(g, partialTick, editing);
		g.pop();
	}

	public int screenX(int sw, float s) {
		return (int) Math.round(Math.max(0, Math.min(sw - width * s, x * sw)));
	}

	public int screenY(int sh, float s) {
		return (int) Math.round(Math.max(0, Math.min(sh - height * s, y * sh)));
	}

	public NumberSetting scaleSetting() {
		return scale;
	}

	public float scaledWidthFactor() {
		return scale.getFloat();
	}

	public int scaledWidth() {
		return (int) Math.ceil(width * scale.get());
	}

	public int scaledHeight() {
		return (int) Math.ceil(height * scale.get());
	}

	public void setPosition(double fx, double fy) {
		x = Math.max(0, Math.min(1, fx));
		y = Math.max(0, Math.min(1, fy));
	}

	public void resetPosition() {
		x = defaultX;
		y = defaultY;
	}

	@Override
	public JsonObject save() {
		JsonObject o = super.save();
		JsonObject hud = new JsonObject();
		hud.addProperty("x", x);
		hud.addProperty("y", y);
		o.add("hud", hud);
		return o;
	}

	@Override
	public void load(JsonObject o) {
		super.load(o);
		if (o != null && o.has("hud") && o.get("hud").isJsonObject()) {
			JsonObject hud = o.getAsJsonObject("hud");
			try {
				setPosition(hud.get("x").getAsDouble(), hud.get("y").getAsDouble());
			} catch (RuntimeException ignored) {
				resetPosition();
			}
		}
	}
}
