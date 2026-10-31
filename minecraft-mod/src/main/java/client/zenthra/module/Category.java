package client.zenthra.module;

public enum Category {
	HUD("HUD"),
	PVP("PvP"),
	CAMERA("Caméra"),
	UTILITY("Utilitaires"),
	WORLD("Monde");

	public final String label;

	Category(String label) {
		this.label = label;
	}
}
