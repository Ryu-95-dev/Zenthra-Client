package client.zenthra.mixin;

import client.zenthra.Hooks;
import net.minecraft.client.MouseHandler;
import org.lwjgl.glfw.GLFW;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
	@Inject(method = "onPress", at = @At("HEAD"))
	private void zenthra$onPress(long window, int button, int action, int mods, CallbackInfo ci) {
		if (action == GLFW.GLFW_PRESS) Hooks.onMousePress(button);
	}

	@Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
	private void zenthra$onScroll(long window, double xOffset, double yOffset, CallbackInfo ci) {
		if (Hooks.onScroll(yOffset)) ci.cancel();
	}
}
