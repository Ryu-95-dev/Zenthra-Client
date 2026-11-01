package client.zenthra.module.impl;

import client.zenthra.compat.Platform;
import client.zenthra.module.Category;
import client.zenthra.module.Module;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ChoiceSetting;
import client.zenthra.module.setting.NumberSetting;
import com.google.gson.JsonObject;
import java.util.List;
import net.minecraft.client.CloudStatus;
import net.minecraft.client.Options;

/**
 * Lighter rendering through Minecraft's own video options: fewer particles,
 * distant entities hidden, no entity shadows or clouds, fast biome blending.
 * The player's own values are saved when the module turns on and put back
 * exactly when it turns off.
 */
public class OptimizationModule extends Module {
	private final ChoiceSetting particles = add(new ChoiceSetting("particles", "Particules",
		List.of("decreased", "minimal"), List.of("Réduites", "Minimales"), "decreased"));
	private final NumberSetting entityDistance = add(new NumberSetting("entity_distance", "Distance d'affichage des entités", 75, 50, 100, 5, " %"));
	private final BooleanSetting shadows = add(new BooleanSetting("no_shadows", "Couper les ombres des entités", true));
	private final BooleanSetting clouds = add(new BooleanSetting("no_clouds", "Couper les nuages", true));
	private final BooleanSetting biomeBlend = add(new BooleanSetting("fast_biome_blend", "Transitions de biomes rapides", true));

	/** The player's values before the module changed them (null when nothing is saved). */
	private JsonObject saved;
	private boolean applied;

	public OptimizationModule() {
		super("optimization", "Zenthra Optimisation", "Plus de FPS : moins de particules, entités lointaines masquées, sans ombres ni nuages.", Category.UTILITY, false);
	}

	@Override
	public String hint() {
		return "Modifie les options vidéo de Minecraft tant que le module est actif ; tes réglages sont remis à l'identique quand tu le désactives.";
	}

	private Options options() {
		return mc.options;
	}

	@Override
	protected void onEnable() {
		if (mc.options == null) return;
		if (saved == null) {
			Options o = options();
			saved = new JsonObject();
			saved.addProperty("particles", Platform.particlesLevel());
			saved.addProperty("entity_distance", o.entityDistanceScaling().get());
			saved.addProperty("shadows", o.entityShadows().get());
			saved.addProperty("clouds", o.cloudStatus().get().ordinal());
			saved.addProperty("biome_blend", o.biomeBlendRadius().get());
		}
		applied = false; // applied on the next tick, on the render thread
	}

	@Override
	public void tick() {
		if (!applied) apply();
	}

	@Override
	public void onSettingsChanged() {
		if (isEnabled()) apply();
	}

	private void apply() {
		if (mc.options == null || saved == null) return;
		Options o = options();
		Platform.setParticlesLevel(particles.is("minimal") ? 2 : Math.max(1, saved.get("particles").getAsInt()));
		o.entityDistanceScaling().set(Math.min(saved.get("entity_distance").getAsDouble(), entityDistance.get() / 100.0));
		o.entityShadows().set(shadows.get() ? false : saved.get("shadows").getAsBoolean());
		o.cloudStatus().set(clouds.get() ? CloudStatus.OFF : CloudStatus.values()[saved.get("clouds").getAsInt()]);
		o.biomeBlendRadius().set(biomeBlend.get() ? 0 : saved.get("biome_blend").getAsInt());
		o.save();
		applied = true;
	}

	@Override
	protected void onDisable() {
		if (mc.options == null || saved == null) return;
		Options o = options();
		Platform.setParticlesLevel(saved.get("particles").getAsInt());
		o.entityDistanceScaling().set(saved.get("entity_distance").getAsDouble());
		o.entityShadows().set(saved.get("shadows").getAsBoolean());
		o.cloudStatus().set(CloudStatus.values()[saved.get("clouds").getAsInt()]);
		o.biomeBlendRadius().set(saved.get("biome_blend").getAsInt());
		o.save();
		saved = null;
	}

	@Override
	public JsonObject save() {
		JsonObject o = super.save();
		if (saved != null) o.add("savedOptions", saved);
		return o;
	}

	@Override
	public void load(JsonObject o) {
		if (o != null && o.has("savedOptions") && o.get("savedOptions").isJsonObject()) saved = o.getAsJsonObject("savedOptions");
		super.load(o);
	}
}