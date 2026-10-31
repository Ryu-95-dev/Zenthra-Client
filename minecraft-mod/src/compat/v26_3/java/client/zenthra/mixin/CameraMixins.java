package client.zenthra.mixin;

import client.zenthra.Hooks;
import net.minecraft.client.Camera;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Zoom (FOV) and free look (camera rotation, mouse input) for 26.x, where the camera computes its own FOV. */
public final class CameraMixins {
	private CameraMixins() {}

	@Mixin(Entity.class)
	public static class Turn {
		@Inject(method = "turn", at = @At("HEAD"), cancellable = true)
		private void zenthra$freelook(double yRot, double xRot, CallbackInfo ci) {
			if (Hooks.freeLookTurn(this, yRot, xRot)) ci.cancel();
		}
	}

	@Mixin(Camera.class)
	public abstract static class Rotation {
		@Shadow
		protected abstract void setRotation(float yRot, float xRot);

		@Inject(method = "calculateFov", at = @At("RETURN"), cancellable = true)
		private void zenthra$zoom(float partialTick, CallbackInfoReturnable<Float> cir) {
			double m = Hooks.fovMultiplier();
			if (m != 1.0) cir.setReturnValue((float) (cir.getReturnValue() * m));
		}

		@Redirect(method = "alignWithEntity", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"))
		private void zenthra$freelookRotation(Camera camera, float yRot, float xRot) {
			float[] a = Hooks.freeLookAngles();
			if (a != null) setRotation(a[0], a[1]);
			else setRotation(yRot, xRot);
		}
	}
}