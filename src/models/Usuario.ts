import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const usuarioSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  telefono: {
    type: String,
    required: true,
    unique: true
  },
  rol: {
    type: String,
    enum: ["usuario", "admin"],
    default: "usuario"
  },
  premium: {
  type: Boolean,
  default: false
},
premiumDesde: {
  type: Date,
  default: null
},
premiumHasta: {
  type: Date,
  default: null
},
  reputacion: {
    type: Number,
    default: 0
  },
  confirmacionesRealizadas: {
    type: Number,
    default: 0
  },
  reportesCreados: {
    type: Number,
    default: 0
  },
  activo: {
    type: Boolean,
    default: true
  },
  
  // Ubicación del usuario (para notificaciones cercanas)
  ubicacion: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number],
      default: [0, 0] // [longitud, latitud]
    }
  },
  
  // Token para notificaciones push
  pushToken: {
    type: String,
    default: null
  }
  
}, {
  timestamps: true
});

// Índice geoespacial para búsquedas por cercanía
usuarioSchema.index({ ubicacion: "2dsphere" });

// Hash de contraseña antes de guardar
usuarioSchema.pre("save", async function() {
  // @ts-ignore
  if (!this.isModified("password")) return;
  
  try {
    // @ts-ignore
    const salt = await bcrypt.genSalt(10);
    // @ts-ignore
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    console.error("Error al hashear password:", error);
    throw error;
  }
});

// Método para comparar contraseñas
usuarioSchema.methods.compararPassword = async function(password: string): Promise<boolean> {
  try {
    // @ts-ignore
    const user = this;
    return await bcrypt.compare(password, user.password);
  } catch (error) {
    console.error("Error comparando passwords:", error);
    return false;
  }
};

export const Usuario = mongoose.model("Usuario", usuarioSchema);