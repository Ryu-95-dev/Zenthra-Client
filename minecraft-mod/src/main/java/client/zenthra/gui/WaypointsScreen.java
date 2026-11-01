package client.zenthra.gui;

import client.zenthra.compat.Platform;
import client.zenthra.ZenthraClient;
import client.zenthra.module.impl.WaypointsModule;
import client.zenthra.module.impl.WaypointsModule.Waypoint;
import java.util.ArrayList;
import java.util.List;
import client.zenthra.compat.Gfx;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;

/** Lists, edits, hides and deletes waypoints. */
public class WaypointsScreen extends BaseScreen {
	private double scroll;
	private boolean allDimensions;

	public WaypointsScreen(Screen parent) {
		super(Component.literal("Waypoints"), parent);
	}

	private WaypointsModule module() {
		return ZenthraClient.modules().get(WaypointsModule.class);
	}

	@Override
	protected void init() {
		layoutPanel(420, 300);
		int by = py + ph - 26;
		button("Ajouter ici", px + 10, by, 100, 20, b -> {
			if (minecraft.player == null) return;
			Waypoint wp = module().createHere("Repère " + (module().list().size() + 1));
			Platform.setScreen(new WaypointEditScreen(this, wp, true));
		});
		button(allDimensions ? "Tous les repères" : "Ici seulement", px + 114, by, 120, 20, b -> {
			allDimensions = !allDimensions;
			b.setMessage(Component.literal(allDimensions ? "Tous les repères" : "Ici seulement"));
		});
		button("Retour", px + pw - 100, by, 90, 20, b -> onClose());
	}

	@Override
	protected void renderContent(Gfx g, int mx, int my, float pt) {
		int x = px + 12, w = pw - 24;
		g.text("Waypoints", x, py + 10, TEXT, false);
		if (!module().isEnabled()) g.text("Module désactivé : les repères ne s'affichent pas.", x + 70, py + 10, 0xFFFACC15, false);

		String dim = module().currentDimension();
		List<Waypoint> list = new ArrayList<>();
		for (Waypoint wp : module().list()) if (allDimensions || module().belongsHere(wp)) list.add(wp);

		int top = py + 28, bottom = py + ph - 32, rowH = 26;
		scroll = Mth.clamp(scroll, 0, Math.max(0, list.size() * rowH - (bottom - top)));
		g.scissor(x, top, x + w, bottom);
		int y = top - (int) scroll;
		for (Waypoint wp : list) {
			boolean inside = my >= top && my < bottom;
			g.fill(x, y, x + w, y + rowH - 4, hovered(mx, my, x, y, w, rowH - 4) && inside ? CARD_HOVER : CARD);
			Ui.round(g, x + 4, y + 5, 12, 12, wp.color | 0xFF000000);
			ZIcon wpIcon = WaypointsModule.iconOf(wp);
			if (wpIcon != null) Ui.icon(g, wpIcon, x + 6, y + 7, 8, true);
			else g.text(wp.name.isEmpty() ? "?" : wp.name.substring(0, 1).toUpperCase(java.util.Locale.ROOT), x + 8, y + 7, 0xFFFFFFFF, true);
			g.text(font.plainSubstrByWidth(wp.name, w - 200), x + 20, y + 3, wp.visible ? TEXT : MUTED, false);
			String info = wp.x + " " + wp.y + " " + wp.z + (wp.dimension.equals(dim) && minecraft.player != null
				? " · " + Math.round(Math.sqrt(minecraft.player.distanceToSqr(wp.x + 0.5, wp.y, wp.z + 0.5))) + " m"
				: " · " + wp.dimension.replace("minecraft:", ""));
			g.text(info, x + 20, y + 12, MUTED, false);

			int bx = x + w - 6;
			bx = action(g, mx, my, bx, y, "Supprimer", 0xFFF87171, inside, () -> {
				module().remove(wp);
			});
			bx = action(g, mx, my, bx, y, "Modifier", ACCENT, inside, () -> Platform.setScreen(new WaypointEditScreen(this, wp, false)));
			action(g, mx, my, bx, y, wp.visible ? "Masquer" : "Afficher", MUTED, inside, () -> {
				wp.visible = !wp.visible;
				ZenthraClient.config().markDirty();
			});
			y += rowH;
		}
		g.endScissor();
		if (list.isEmpty()) g.text("Aucun repère. Appuie sur B en jeu ou sur « Ajouter ici ».", x, top + 4, MUTED, false);
	}

	private int action(Gfx g, int mx, int my, int right, int y, String label, int color, boolean inside, Runnable r) {
		int w = font.width(label);
		int x = right - w;
		g.text(label, x, y + 7, hovered(mx, my, x - 3, y, w + 6, 22) ? TEXT : color, false);
		if (inside) region(x - 3, y, w + 6, 22, r);
		return x - 10;
	}

	@Override
	protected boolean zScroll(double mx, double my, double amount) {
		scroll -= amount * 16;
		return true;
	}
}
