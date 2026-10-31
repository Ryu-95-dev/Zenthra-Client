package client.zenthra.compat;

import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

/** Called after each rendered world frame with the camera matrices (waypoints, frame timing). */
@FunctionalInterface
public interface WorldFrameListener {
	/** `view` rotates world-relative positions into camera space; `projection` maps them to clip space. */
	void onWorldFrame(Matrix4f view, Matrix4f projection, Vec3 cameraPos);
}
