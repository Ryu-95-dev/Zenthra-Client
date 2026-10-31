package client.zenthra.mixin;

import client.zenthra.Hooks;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import com.mojang.blaze3d.platform.InputConstants;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
	@Inject(method = "onButton", at = @At("HEAD"))
	private void zenthra$onPress(long window, MouseButtonInfo info, int action, CallbackInfo ci) {
		if (action == InputConstants.PRESS) Hooks.onMousePress(info.button());
	}

	@Inject(method = "onScroll", at = @At("HEAD"), cancellable = true)
	private void zenthra$onScroll(long window, double xOffset, double yOffset, CallbackInfo ci) {
		if (Hooks.onScroll(yOffset)) ci.cancel();
	}
}