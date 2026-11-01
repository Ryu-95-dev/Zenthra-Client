package client.zenthra.gui;

import client.zenthra.ZenthraClient;
import client.zenthra.compat.Platform;
import client.zenthra.module.impl.WaypointsModule;
import client.zenthra.module.impl.WaypointsModule.Waypoint;
import client.zenthra.module.setting.ColorSetting;
import client.zenthra.compat.Gfx;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Creates or edits a waypoint: name, colour, marker icon and coordinates. */
public class WaypointEditScreen extends BaseScreen {
	private final Waypoint waypoint;
	private final boolean isNew;
	private EditBox name, x, y, z;
	private int color;
	private String icon;
	private String error;

	public WaypointEditScreen(Screen parent, Waypoint waypoint, boolean isNew) {
		super(Component.literal(isNew ? "Nouveau repère" : "Modifier le repère"), parent);
		this.waypoint = waypoint;
		this.isNew = isNew;
		this.color = waypoint.color;
		this.icon = waypoint.icon;
	}

	@Override
	protected void init() {
		layoutPanel(320, 214);
		int lx = px + 12, fw = pw - 24;
		name = editBox(lx, py + 34, fw, 16, "Nom");
		name.setMaxLength(32);
		name.setValue(waypoint.name);
		int cw = (fw - 8) / 3;
		x = coord(lx, waypoint.x, cw);
		y = coord(lx + cw + 4, waypoint.y, cw);
		z = coord(lx + 2 * (cw + 4), waypoint.z, cw);
		setInitialFocus(name);

		int by = py + ph - 26;
		button("Enregistrer", px + pw - 196, by, 90, 20, b -> save());
		button("Annuler", px + pw - 100, by, 90, 20, b -> onClose());
	}

	private EditBox coord(int bx, int value, int w) {
		EditBox box = editBox(bx, py + 74, w, 16, "Coordonnée");
		box.setMaxLength(9);
		box.setValue(String.valueOf(value));
		Platform.integerOnly(box);
		return box;
	}

	private void save() {
		String n = name.getValue().trim();
		if (n.isEmpty()) {
			error = "Le nom est obligatoire.";
			return;
		}
		try {
			waypoint.x = Integer.parseInt(x.getValue());
			waypoint.y = Integer.parseInt(y.getValue());
			waypoint.z = Integer.parseInt(z.getValue());
		} catch (NumberFormatException e) {
			error = "Coordonnées invalides.";
			return;
		}
		waypoint.name = n;
		waypoint.color = color;
		waypoint.icon = icon;
		if (isNew) ZenthraClient.modules().get(WaypointsModule.class).add(waypoint);
		else ZenthraClient.config().markDirty();
		onClose();
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		int lx = px + 12;
		g.text(getTitle().getString(), lx, py + 10, TEXT, false);
		g.text("Nom", lx, py + 24, MUTED, false);
		g.text("X           Y           Z", lx, py + 64, MUTED, false);
		g.text("Couleur", lx, py + 100, MUTED, false);
		int sx = lx;
		for (int c : ColorSetting.PRESETS) {
			if ((c & 0xFFFFFF) == (color & 0xFFFFFF)) g.fill(sx - 1, py + 111, sx + 13, py + 125, 0xFFFFFFFF);
			g.fill(sx, py + 112, sx + 12, py + 124, c);
			final int col = c;
			region(sx, py + 111, 13, 14, () -> color = col);
			sx += 16;
		}
		// Marker: first letter, or one of the icons.
		g.text("Icône", lx, py + 132, MUTED, false);
		int ix = lx, iy = py + 143;
		for (int i = -1; i < WaypointsModule.ICONS.size(); i++) {
			String id = i < 0 ? null : WaypointsModule.ICONS.get(i);
			boolean selected = java.util.Objects.equals(id, icon);
			if (ix + 14 > px + pw - 70) {
				ix = lx;
				iy += 17;
			}
			Ui.round(g, ix, iy, 14, 14, selected ? 0xFF6A40B8 : 0x60201433);
			if (selected) Ui.roundOutline(g, ix - 1, iy - 1, 16, 16, 0xFFFFFFFF);
			if (id == null) {
				String letter = name.getValue().isEmpty() ? "A" : name.getValue().substring(0, 1).toUpperCase(java.util.Locale.ROOT);
				g.text(letter, ix + 7 - font.width(letter) / 2, iy + 3, 0xFFFFFFFF, true);
			} else {
				Ui.icon(g, ZIcon.valueOf("WP_" + id.toUpperCase(java.util.Locale.ROOT)), ix + 2, iy + 2, 10, true);
			}
			region(ix, iy, 14, 14, () -> icon = id);
			ix += 17;
		}
		// Live preview of the marker.
		WaypointsModule.Waypoint preview = new WaypointsModule.Waypoint(name.getValue().isEmpty() ? "Repère" : name.getValue(), 0, 0, 0, "", color);
		preview.icon = icon;
		int cx = px + pw - 36, cy = py + 160;
		Ui.round(g, cx - 32, cy - 26, 64, 46, 0xFF2A3A2A);
		WaypointsModule.drawMarker(g, preview, cx, cy - 2, 1f, "12 m");
		if (error != null) g.text(error, lx, py + ph - 20, 0xFFF87171, false);
	}
}
