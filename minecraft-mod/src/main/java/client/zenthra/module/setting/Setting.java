package client.zenthra.module.setting;

import com.google.gson.JsonElement;

/** A configurable value of a module, persisted in zenthra.json. */
public abstract class Setting<T> {
	private final String id;
	private final String name;
	private final T defaultValue;
	protected T value;

	protected Setting(String id, String name, T defaultValue) {
		this.id = id;
		this.name = name;
		this.defaultValue = defaultValue;
		this.value = defaultValue;
	}

	public String id() {
		return id;
	}

	public String name() {
		return name;
	}

	public T get() {
		return value;
	}

	public void set(T value) {
		this.value = value;
	}

	public void reset() {
		this.value = defaultValue;
	}

	public abstract JsonElement toJson();

	/** Reads a value; invalid input keeps the current value. */
	public abstract void fromJson(JsonElement json);

	/** Short text describing the current value, used by the settings screen. */
	public abstract String display();
}
