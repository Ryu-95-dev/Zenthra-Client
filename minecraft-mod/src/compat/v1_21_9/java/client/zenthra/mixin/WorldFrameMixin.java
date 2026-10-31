package client.zenthra.mixin;

import client.zenthra.compat.Platform;
import com.mojang.blaze3d.buffers.GpuBufferSlice;
import com.mojang.blaze3d.resource.GraphicsResourceAllocator;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.renderer.LevelRenderer;
import org.joml.Matrix4f;
import org.joml.Vector4f;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Fabric API has no world-render event for 1.21.9: capture the frame's camera matrices here. */
@Mixin(LevelRenderer.class)
public class WorldFrameMixin {
	@Inject(method = "renderLevel", at = @At("RETURN"))
	private void zenthra$frame(GraphicsResourceAllocator allocator, DeltaTracker delta, boolean outline, Camera camera, Matrix4f view,
			Matrix4f projection, Matrix4f cullProjection, GpuBufferSlice fog, Vector4f fogColor, boolean sky, CallbackInfo ci) {
		Platform.onWorldFrame(view, projection, camera.position());
	}
}