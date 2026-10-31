package client.zenthra.mixin;

import client.zenthra.Hooks;
import net.minecraft.client.Camera;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.Redirect;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** Zoom (FOV) and free look (camera rotation, mouse input) for 1.21.5. */
public final class CameraMixins {
	private CameraMixins() {}

	@Mixin(GameRenderer.class)
	public static class Fov {
		@Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
		private void zenthra$zoom(net.minecraft.client.Camera camera, float partialTick, boolean useFovSetting, CallbackInfoReturnable<Float> cir) {
			double m = Hooks.fovMultiplier();
			if (useFovSetting && m != 1.0) cir.setReturnValue((float) (cir.getReturnValue() * m));
		}
	}

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

		@Redirect(method = "setup", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/Camera;setRotation(FF)V"))
		private void zenthra$freelookRotation(Camera camera, float yRot, float xRot) {
			float[] a = Hooks.freeLookAngles();
			if (a != null) setRotation(a[0], a[1]);
			else setRotation(yRot, xRot);
		}
	}
}
