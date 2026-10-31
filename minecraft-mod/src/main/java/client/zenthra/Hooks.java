package client.zenthra;

import client.zenthra.compat.Platform;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.FreeLookModule;
import client.zenthra.module.impl.PotionHudModule;
import client.zenthra.module.impl.ScoreboardModule;
import client.zenthra.module.impl.ZoomModule;
import client.zenthra.util.CpsTracker;
import net.minecraft.client.Minecraft;

/**
 * Version-independent entry points called by the mixins of each version
 * family (src/compat/<family>/java/client/zenthra/mixin). The mixins only
 * adapt Minecraft's signatures; all decisions are taken here.
 */
public final class Hooks {
	private Hooks() {}

	/** A mouse button was pressed (0 = left, 1 = right). */
	public static void onMousePress(int button) {
		if (Platform.screen() == null) CpsTracker.onClick(button);
	}

	/** Returns true when the wheel movement was used by the zoom and must be cancelled. */
	public static boolean onScroll(double amount) {
		return Platform.screen() == null && ZenthraClient.modules().get(ZoomModule.class).onScroll(amount);
	}

	/** Factor applied to the field of view (1 = unchanged). */
	public static double fovMultiplier() {
		ZoomModule zoom = ZenthraClient.modules().get(ZoomModule.class);
		return zoom.isEnabled() ? zoom.fovMultiplier() : 1.0;
	}

	/** Returns true when the mouse movement of the local player must turn the free-look camera instead. */
	public static boolean freeLookTurn(Object entity, double dx, double dy) {
		if (entity != Minecraft.getInstance().player) return false;
		FreeLookModule freelook = ZenthraClient.modules().get(FreeLookModule.class);
		if (!freelook.isActive()) return false;
		freelook.turn(dx, dy);
		return true;
	}

	/** Camera angles {yaw, pitch} while free look is active, or null. */
	public static float[] freeLookAngles() {
		FreeLookModule freelook = ZenthraClient.modules().get(FreeLookModule.class);
		return freelook.isActive() ? new float[] {freelook.yaw(), freelook.pitch()} : null;
	}

	public static boolean replaceCrosshair() {
		return ZenthraClient.modules().get(CrosshairModule.class).shouldReplace();
	}

	public static boolean hideVanillaEffects() {
		return ZenthraClient.modules().get(PotionHudModule.class).hidesVanillaEffects();
	}

	public static boolean hideScoreboard() {
		ScoreboardModule sb = ZenthraClient.modules().get(ScoreboardModule.class);
		return sb.isEnabled() && sb.hide.get();
	}

	/** {scale, vertical offset} for the sidebar scoreboard, or null when unchanged. */
	public static float[] scoreboardTransform() {
		ScoreboardModule sb = ZenthraClient.modules().get(ScoreboardModule.class);
		return sb.isEnabled() && !sb.hide.get() ? new float[] {sb.scale.getFloat(), sb.offsetY.getFloat()} : null;
	}
}
