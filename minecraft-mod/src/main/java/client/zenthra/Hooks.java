package client.zenthra;

import client.zenthra.compat.Platform;
import client.zenthra.module.impl.CrosshairModule;
import client.zenthra.module.impl.FreeLookModule;
import client.zenthra.module.impl.HitColorModule;
import client.zenthra.module.impl.PotionHudModule;
import client.zenthra.module.impl.ScoreboardModule;
import client.zenthra.module.impl.ZoomModule;
import client.zenthra.util.CpsTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.OverlayTexture;

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

	private static int armorOverlay = -1;

	/** Called when an entity's armor starts rendering: armor gets the same hurt tint as the body when Hit Color asks for it. */
	public static void beginArmor(boolean hurt) {
		HitColorModule hc = ZenthraClient.modules().get(HitColorModule.class);
		armorOverlay = hurt && hc.isEnabled() && hc.tintsArmor() ? OverlayTexture.pack(OverlayTexture.u(0f), OverlayTexture.v(true)) : -1;
	}

	/** True while hurt armor must be drawn with the entity shader (the armor shader ignores the hurt tint). */
	public static boolean tintArmor() {
		return armorOverlay >= 0;
	}

	public static void endArmor() {
		armorOverlay = -1;
	}

	/** Overlay used for armor pieces (vanilla always uses "no overlay", so armor never turned red). */
	public static int armorOverlay(int vanilla) {
		return armorOverlay >= 0 ? armorOverlay : vanilla;
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
