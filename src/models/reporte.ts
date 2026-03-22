import mongoose from "mongoose";

export interface IComentario {
  usuarioId: mongoose.Types.ObjectId;
  nombre: string;
  texto: string;
  createdAt: Date;
}

export interface IReacciones {
  like: number;
  urgente: number;
  peligro: number;
}

export interface IReporte extends mongoose.Document {
  categoria: string;
  tipo: string;
  descripcion: string;
  ubicacion: {
    type: string;
    coordinates: number[];
  };
  estado: string;
  confirmaciones: number;
  reportesFalsos: number;
  creadoPor: mongoose.Types.ObjectId;
  confirmadoPor: mongoose.Types.ObjectId[];
  expiraEn: Date;
  archivado: boolean;
  reacciones: IReacciones;
  comentarios: IComentario[];
  createdAt: Date;
  updatedAt: Date;
}

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
      "accidente", "delito", "trafico", "clima",
      "embotellamiento", "choque", "semaforoRoto", "calleCortada",
      "asalto", "actitudSospechosa", "balacera",
      "incendio", "inundacion",
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
  // ✅ REACCIONES - CAMPO CORRECTO
  reacciones: {
    like: { type: Number, default: 0 },
    urgente: { type: Number, default: 0 },
    peligro: { type: Number, default: 0 }
  },
  // ✅ COMENTARIOS - CAMPO SEPARADO (NO DENTRO DE reacciones)
  comentarios: [{
    usuarioId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true
    },
    nombre: {
      type: String,
      required: true
    },
    texto: {
      type: String,
      required: true,
      maxlength: 300
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Índice geoespacial
reporteSchema.index({ ubicacion: "2dsphere" });

export const Reporte = mongoose.model<IReporte>("Reporte", reporteSchema);