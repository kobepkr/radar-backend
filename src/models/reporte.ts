import mongoose from "mongoose";

const reporteSchema = new mongoose.Schema({
  categoria: {
    type: String,
    required: true,
    enum: ["transito", "seguridad", "emergencias", "comunidad"]
  },
  tipo: {
    type: String,
    required: true,
  enum: [
  // TIPOS ANTIGUOS (los que usa la app)
  "accidente", "delito", "trafico", "clima",
  
  // TIPOS NUEVOS (los que agregamos después)
  // TRANSITO
  "embotellamiento", "choque", "semaforoRoto", "calleCortada",
  // SEGURIDAD
  "asalto", "actitudSospechosa", "balacera",
  // EMERGENCIAS
  "incendio", "inundacion",
  // COMUNIDAD
  "bache", "corteLuz", "corteAgua"
]
  },
  descripcion: {
    type: String,
    maxlength: 200
  },
  ubicacion: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number],
      required: true
    }
  },
  estado: {
    type: String,
    enum: ["no_confirmado", "confirmado", "falso"],
    default: "no_confirmado"
  },
  confirmaciones: {
    type: Number,
    default: 0
  },
  reportesFalsos: {
    type: Number,
    default: 0
  },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario"
  },
  confirmadoPor: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: "Usuario"
}],
  expiraEn: {
    type: Date,
    required: true
  },
  archivado: {
    type: Boolean,
    default: false
  },
  reacciones: {
  type: {
    like: { type: Number, default: 0 },
    urgente: { type: Number, default: 0 },
    peligro: { type: Number, default: 0 }
  },
  default: {}
}
  
  
}, {
  timestamps: true
});

// Índice geoespacial
reporteSchema.index({ ubicacion: "2dsphere" });

export const Reporte = mongoose.model("Reporte", reporteSchema);