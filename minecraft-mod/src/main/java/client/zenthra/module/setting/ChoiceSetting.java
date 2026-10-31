package client.zenthra.module.setting;

import com.google.gson.JsonElement;
import com.google.gson.JsonPrimitive;
import java.util.List;

/** One value among a fixed list of identifiers, each with a display label. */
public class ChoiceSetting extends Setting<String> {
	private final List<String> ids;
	private final List<String> labels;

	public ChoiceSetting(String id, String name, List<String> ids, List<String> labels, String defaultId) {
		super(id, name, defaultId);
		this.ids = ids;
		this.labels = labels;
	}

	public void cycle() {
		value = ids.get((ids.indexOf(value) + 1) % ids.size());
	}

	public boolean is(String id) {
		return value.equals(id);
	}

	@Override
	public JsonElement toJson() {
		return new JsonPrimitive(value);
	}

	@Override
	public void fromJson(JsonElement json) {
		if (json != null && json.isJsonPrimitive() && ids.contains(json.getAsString())) value = json.getAsString();
	}

	@Override
	public String display() {
		int i = ids.indexOf(value);
		return i >= 0 ? labels.get(i) : value;
	}
}
