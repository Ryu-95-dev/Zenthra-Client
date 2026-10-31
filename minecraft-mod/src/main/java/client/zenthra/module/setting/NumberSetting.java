package client.zenthra.module.setting;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;

public class NumberSetting extends Setting<Double> {
	private final double min;
	private final double max;
	private final double step;
	private final String unit;

	public NumberSetting(String id, String name, double defaultValue, double min, double max, double step, String unit) {
		super(id, name, defaultValue);
		this.min = min;
		this.max = max;
		this.step = step;
		this.unit = unit;
	}

	public double min() {
		return min;
	}

	public double max() {
		return max;
	}

	@Override
	public void set(Double v) {
		double snapped = Math.round(v / step) * step;
		super.set(Math.max(min, Math.min(max, snapped)));
	}

	/** Sets the value from a 0..1 slider position. */
	public void setFraction(double f) {
		set(min + (max - min) * Math.max(0, Math.min(1, f)));
	}

	public double fraction() {
		return (value - min) / (max - min);
	}

	public float getFloat() {
		return value.floatValue();
	}

	public int getInt() {
		return (int) Math.round(value);
	}

	@Override
	public JsonElement toJson() {
		return new JsonPrimitive(value);
	}

	@Override
	public void fromJson(JsonElement json) {
		if (json != null && json.isJsonPrimitive() && json.getAsJsonPrimitive().isNumber()) set(json.getAsDouble());
	}

	@Override
	public String display() {
		String n = step >= 1 ? String.valueOf((int) Math.round(value)) : String.format(java.util.Locale.ROOT, "%.2f", value);
		return n + unit;
	}
}
