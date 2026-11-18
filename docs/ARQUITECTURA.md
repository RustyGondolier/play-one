# Play One - Arquitectura del sistema

Diagrama de despliegue y de flujo de datos. Se usa en el informe (APA 7) y en la demo.

## 1. Despliegue (Render + Neon)

```mermaid
flowchart TB
    subgraph Cliente["Navegador del propietario / ayudante"]
        UI["React 18 + Vite<br/>Login · Dashboard · Pedidos ·<br/>Clientes · Productos · Reportes"]
    end

    subgraph Render["Render Free - S/ 0"]
        Express["Node.js + Express (puerto 3001)<br/>API REST + sirve client/dist<br/>/api/health → estado de la BD"]
        ML["server/ml/<br/>inferencia: aplica ml/modelo.json<br/>(reentrena en Node si falta el artefacto)"]
    end

    subgraph Neon["Neon Free - PostgreSQL"]
        BD[("11 tablas<br/>skus · pedidos · clientes ·<br/>movimientos_stock · estados_pedido ·<br/>consultas_sin_stock · …")]
    end

    subgraph Offline["Entrenamiento OFFLINE (no corre en el servidor)"]
        Colab["Google Colab / local<br/>python ml/entrenar.py<br/>scikit-learn: StandardScaler + Ridge"]
        Artefacto[("ml/modelo.json<br/>coeficientes + métricas")]
    end

    UI -->|"JWT (8 h) · /api/*"| Express
    Express --> ML
    ML -->|"180 días de demanda"| BD
    Express <-->|"pg · DATABASE_URL"| BD
    Artefacto -.->|"se versiona en git"| ML
    Colab -->|"ml/dataset.json"| Artefacto
    Express -->|"exporta ml/dataset.json"| Colab
```

**Claves del diseño**

- **Entrenamiento offline → inferencia online.** El servidor nunca entrena: sólo aplica
  `ml/modelo.json` (~1 ms por request). Si el artefacto falta, reentrena en Node puro y lo
  marca `"origen": "fallback-node"`.
- **Neon en vez de Render Postgres:** el Postgres de Render Free expira a los 30 días;
  el de Neon no. La BD mide ~9 MB de 1 GB.
- **Render Free duerme a los 15 min:** el cold start tarda ~1 min. Para la demo, se abre
  el link antes (ver `DEMO.md`).

## 2. Flujo de un pedido (con la trazabilidad de stock)

```mermaid
sequenceDiagram
    participant U as Usuario (app)
    participant A as API Express
    participant B as PostgreSQL
    participant M as Módulo ML

    U->>A: POST /api/pedidos (DNI, talla, dirección)
    A->>A: valida stock, dirección y descuento
    A->>B: INSERT pedido (estado: contactado)
    A->>B: UPDATE skus stock_actual − 1
    A->>B: INSERT movimientos_stock (salida, pedido_id)
    A->>B: INSERT estados_pedido (contactado)
    alt Sin stock
        A->>B: ROLLBACK + INSERT consultas_sin_stock
        A-->>U: 409 «Sin stock disponible»
    end

    Note over B: Histórico de 180 días<br/>Σentradas − Σsalidas = stock_actual

    U->>A: GET /api/reportes/semanal
    A->>B: unidades, pedidos, consultas de la semana<br/>vs. semana anterior
    A->>M: GET /api/ml/pronostico
    M->>B: serie diaria de ventas (180 días)
    M->>M: Ridge + pronóstico recursivo 7 días
    M-->>A: días hasta el quiebre por talla
    A-->>U: indicadores + tendencia + alerta predictiva
```

## 3. Modelo de datos

```mermaid
erDiagram
    modelos ||--o{ skus : "tiene tallas"
    tallas  ||--o{ skus : "se vende en"
    skus ||--o{ movimientos_stock : "entra y sale"
    skus ||--o{ pedidos : "se vende"
    clientes ||--o{ pedidos : "compra"
    pedidos ||--|| estados_pedido : "historial"
    pedidos ||--o| envios : "hoja PDF"
    pedidos ||--o{ movimientos_stock : "salida/devolución"
    skus ||--o{ consultas_sin_stock : "demanda perdida"

    modelos {
        string codigo PK
        string nombre
        decimal precio_base
        int stock_minimo_default
    }
    skus {
        int id PK
        int stock_actual
        int stock_minimo
        bool disponible
    }
    pedidos {
        int id PK
        string estado "contactado|reservado|despachado|entregado|cancelado"
        decimal precio
        decimal descuento
        string direccion "snapshot"
        string motivo_cancelacion
    }
    movimientos_stock {
        int id PK
        string tipo "entrada|salida|ajuste"
        int cantidad
        int pedido_id "trazabilidad"
    }
```

**Invariante del histórico** (lo verifica `npm run db:setup` y aborta si falla):

```
Σ(entradas) − Σ(salidas) = stock_actual     en cada SKU disponible
```

## 4. Módulo ML

```mermaid
flowchart LR
    A["movimientos_stock<br/>(180 días)"] --> B["server/ml/dataset.js<br/>serie diaria por SKU"]
    B --> C["features.js<br/>media7 · media28 ·<br/>pendiente · finde"]
    C --> D{"¿existe<br/>ml/modelo.json?"}
    D -->|sí| E["inferencia.js<br/>aplica el artefacto"]
    D -->|no| F["Ridge en Node puro<br/>(fallback-node)"]
    E --> G["pronóstico 7 días<br/>días hasta el quiebre<br/>riesgo alto/medio/bajo"]
    F --> G
    G --> H["GET /api/ml/pronostico<br/>GET /api/reportes/semanal"]
    I["ml/entrenar.py<br/>scikit-learn"] -.->|"ml/modelo.json"| D
    B -.->|"ml/dataset.json"| I
```

Ver [`../ml/README.md`](../ml/README.md) para las fórmulas, las características y las
métricas del backtest.
