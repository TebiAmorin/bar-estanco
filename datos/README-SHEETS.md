# Datos para Google Sheets — Bar Estanco

## Instrucciones

Cada archivo CSV corresponde a una hoja (pestaña) del Google Sheet.

### Cómo importar:
1. Abre Google Sheets → Archivo → Importar
2. Selecciona cada CSV
3. Cada CSV = una pestaña nueva
4. Mantén los encabezados exactos (la web los usa para mapear datos)

### Convenciones:
- **precio**: Dejar vacío si está pendiente de confirmar (la web mostrará "Consultar")
- **precio_copa**: Solo rellenar si ese vino se sirve por copa
- **disponible**: "si" o "no" — permite ocultar vinos temporalmente sin borrarlos
- **destacado**: "si" para que aparezca en la sección de recomendaciones de la home
- **descripcion**: 1-2 frases breves, estilo cercano, sin tecnicismos excesivos

### Hojas:
1. `vinos_tintos.csv` — Ribera, Mencía, Rioja, Internacionales
2. `vinos_blancos.csv` — Ribeiro, Godello, Albariño, Rueda, Rioja Blanco, Otras DO
3. `vinos_rosados.csv`
4. `vinos_espumosos.csv`
5. `vinos_sin_alcohol.csv`
6. `vermuts.csv`
7. `tapas_raciones.csv`
8. `pates_conservas.csv`
