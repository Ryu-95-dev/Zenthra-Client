package client.zenthra.mixin;

import client.zenthra.Hooks;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.scores.Objective;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Gui.class)
public class GuiMixin {
	private boolean zenthra$pushed;

	@Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
	private void zenthra$crosshair(GuiGraphics g, DeltaTracker delta, CallbackInfo ci) {
		if (Hooks.replaceCrosshair()) ci.cancel();
	}

	@Inject(method = "renderEffects", at = @At("HEAD"), cancellable = true)
	private void zenthra$effects(GuiGraphics g, DeltaTracker delta, CallbackInfo ci) {
		if (Hooks.hideVanillaEffects()) ci.cancel();
	}

	@Inject(method = "displayScoreboardSidebar", at = @At("HEAD"), cancellable = true)
	private void zenthra$scoreboardPre(GuiGraphics g, Objective objective, CallbackInfo ci) {
		if (Hooks.hideScoreboard()) {
			ci.cancel();
			return;
		}
		float[] t = Hooks.scoreboardTransform();
		if (t == null) return;
		// Scale around the right-centre anchor where vanilla draws the sidebar.
		int w = g.guiWidth(), h = g.guiHeight();
		g.pose().pushMatrix();
		g.pose().translate(w, h / 2f + t[1]);
		g.pose().scale(t[0], t[0]);
		g.pose().translate(-w, -h / 2f);
		zenthra$pushed = true;
	}

	@Inject(method = "displayScoreboardSidebar", at = @At("RETURN"))
	private void zenthra$scoreboardPost(GuiGraphics g, Objective objective, CallbackInfo ci) {
		if (zenthra$pushed) {
			zenthra$pushed = false;
			g.pose().popMatrix();
		}
	}
}
