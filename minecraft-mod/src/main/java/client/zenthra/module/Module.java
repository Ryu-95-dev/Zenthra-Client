package client.zenthra.module;

import client.zenthra.module.setting.Setting;
import com.google.gson.JsonObject;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;

/**
 * Base class of every Zenthra feature. Identifiers must match
 * shared/modules.json on the launcher side.
 */
public abstract class Module {
	protected static final Minecraft mc = Minecraft.getInstance();

	private final String id;
	private final String name;
	private final String description;
	private final Category category;
	private final boolean defaultEnabled;
	private final List<Setting<?>> settings = new ArrayList<>();
	private boolean enabled;

	protected Module(String id, String name, String description, Category category, boolean defaultEnabled) {
		this.id = id;
		this.name = name;
		this.description = description;
		this.category = category;
		this.defaultEnabled = defaultEnabled;
		this.enabled = defaultEnabled;
	}

	protected <S extends Setting<?>> S add(S setting) {
		settings.add(setting);
		return setting;
	}

	public String id() {
		return id;
	}

	public String name() {
		return name;
	}

	public String description() {
		return description;
	}

	public Category category() {
		return category;
	}

	public List<Setting<?>> settings() {
		return settings;
	}

	/** Optional short note shown in the settings screen (key bindings, compatibility). */
	public String hint() {
		return null;
	}

	public boolean isEnabled() {
		return enabled;
	}

	public void setEnabled(boolean value) {
		if (value == enabled) return;
		enabled = value;
		if (value) onEnable();
		else onDisable();
	}

	public void toggle() {
		setEnabled(!enabled);
	}

	protected void onEnable() {}

	protected void onDisable() {}

	/** Called every client tick while enabled. */
	public void tick() {}

	/** Called after a setting changed from the GUI. */
	public void onSettingsChanged() {}

	public void resetSettings() {
		settings.forEach(Setting::reset);
		onSettingsChanged();
	}

	/** Back to the out-of-the-box state: default settings and default on/off. */
	public void resetToDefaults() {
		resetSettings();
		if (this instanceof HudModule hud) hud.resetPosition();
		setEnabled(defaultEnabled);
	}

	public JsonObject save() {
		JsonObject o = new JsonObject();
		o.addProperty("enabled", enabled);
		JsonObject s = new JsonObject();
		for (Setting<?> setting : settings) s.add(setting.id(), setting.toJson());
		o.add("settings", s);
		return o;
	}

	public void load(JsonObject o) {
		if (o == null) {
			setEnabled(defaultEnabled);
			return;
		}
		if (o.has("settings") && o.get("settings").isJsonObject()) {
			JsonObject s = o.getAsJsonObject("settings");
			for (Setting<?> setting : settings) setting.fromJson(s.get(setting.id()));
		}
		boolean en = o.has("enabled") && o.get("enabled").isJsonPrimitive() ? o.get("enabled").getAsBoolean() : defaultEnabled;
		setEnabled(en);
		onSettingsChanged();
	}
}
