package client.zenthra;

import client.zenthra.compat.Platform;
import net.minecraft.client.KeyMapping;

/** Key bindings, editable in Options → Controls → Zenthra. Default keys use Minecraft's key names (same on every version). */
public final class Keybinds {
	public final KeyMapping openMenu = Platform.key("key.zenthra.menu", "key.keyboard.right.shift");
	public final KeyMapping zoom = Platform.key("key.zenthra.zoom", "key.keyboard.c");
	public final KeyMapping freelook = Platform.key("key.zenthra.freelook", "key.keyboard.left.alt");
	public final KeyMapping addWaypoint = Platform.key("key.zenthra.waypoint", "key.keyboard.b");
	public final KeyMapping toggleSprint = Platform.key("key.zenthra.toggle_sprint", "key.keyboard.v");
}