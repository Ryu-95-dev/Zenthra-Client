package client.zenthra.module.impl;

import client.zenthra.compat.Gfx;
import client.zenthra.module.Category;
import client.zenthra.module.HudModule;
import client.zenthra.module.setting.BooleanSetting;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.module.setting.NumberSetting;
import client.zenthra.util.Draw;
/** Own latency to the server ("Local" in single player). */
public class PingModule extends HudModule {
	private final BooleanSetting background = add(new BooleanSetting("background", "Fond", true));

	public PingModule() {
		super("ping_display", "Ping", "Ta latence avec le serveur, en millisecondes.", Category.HUD, false, 0.13, 0.01);
	}

	@Override
	protected void renderElement(Gfx g, float partialTick, boolean editing) {
		String text;
		int color = 0xFFFFFFFF;
		if (mc.getSingleplayerServer() != null || mc.player == null || mc.getConnection() == null) {
			text = "Ping : local";
		} else {
			var info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
			int ms = info == null ? -1 : info.getLatency();
			text = ms < 0 ? "Ping : ?" : "Ping : " + ms + " ms";
			color = ms < 0 ? 0xFFFFFFFF : ms < 80 ? 0xFF7FE0A8 : ms < 160 ? 0xFFFACC15 : 0xFFF87171;
		}
		int[] size = Draw.label(g, text, color, background.get(), true);
		width = size[0];
		height = size[1];
	}
}