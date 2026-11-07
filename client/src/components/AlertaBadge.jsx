export default function AlertaBadge({ alerta }) {
  return alerta ? (
    <span className="badge badge-rojo">Bajo mínimo</span>
  ) : (
    <span className="badge badge-verde">Disponible</span>
  );
}
