package client.zenthra.module;

import client.zenthra.module.impl.ArmorHudModule;
import client.zenthra.module.impl.CpsCounterModule;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.DirectionHudModule;
import client.zenthra.module.impl.FpsCounterModule;
import client.zenthra.module.impl.FreeLookModule;
import client.zenthra.module.impl.HitColorModule;
import client.zenthra.module.impl.KeystrokesModule;
import client.zenthra.module.impl.PotionHudModule;
import client.zenthra.module.impl.ScoreboardModule;
import client.zenthra.module.impl.SessionTimerModule;
import client.zenthra.module.impl.StatusIndicatorsModule;
import client.zenthra.module.impl.ToggleSprintModule;
import client.zenthra.module.impl.WaypointsModule;
import client.zenthra.module.impl.ZoomModule;
import java.util.List;

public final class ModuleManager {
	private final List<Module> modules = List.of(
		new WaypointsModule(),
		new HitColorModule(),
		new FreeLookModule(),
		new ZoomModule(),
		new KeystrokesModule(),
		new CpsCounterModule(),
		new FpsCounterModule(),
		new ArmorHudModule(),
		new PotionHudModule(),
		new CrosshairModule(),
		new ToggleSprintModule(),
		new DirectionHudModule(),
		new SessionTimerModule(),
		new ScoreboardModule(),
		new StatusIndicatorsModule()
	);

	public List<Module> all() {
		return modules;
	}

	public <T extends Module> T get(Class<T> type) {
		for (Module m : modules) if (type.isInstance(m)) return type.cast(m);
		throw new IllegalArgumentException(type.getName());
	}

	public List<HudModule> hud() {
		return modules.stream().filter(m -> m instanceof HudModule).map(m -> (HudModule) m).toList();
	}
}
