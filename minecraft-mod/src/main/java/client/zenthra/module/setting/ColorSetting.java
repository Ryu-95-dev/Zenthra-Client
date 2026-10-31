package client.zenthra.module.setting;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;

/** ARGB colour stored as "#AARRGGBB" or "#RRGGBB". */
public class ColorSetting extends Setting<Integer> {
	public static final int[] PRESETS = {
		0xFFFFFFFF, 0xFFA855F7, 0xFF8B5CF6, 0xFFEC4899, 0xFFEF4444, 0xFFF97316,
		0xFFEAB308, 0xFF22C55E, 0xFF06B6D4, 0xFF3B82F6, 0xFF000000,
	};

	public ColorSetting(String id, String name, int defaultArgb) {
		super(id, name, defaultArgb);
	}

	@Override
	public JsonElement toJson() {
		return new JsonPrimitive(String.format("#%08X", value));
	}

	@Override
	public void fromJson(JsonElement json) {
		if (json == null || !json.isJsonPrimitive()) return;
		String s = json.getAsString().trim();
		if (!s.matches("#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})")) return;
		long parsed = Long.parseLong(s.substring(1), 16);
		value = (int) (s.length() == 7 ? (0xFF000000L | parsed) : parsed);
	}

	@Override
	public String display() {
		return String.format("#%06X", value & 0xFFFFFF);
	}
}
