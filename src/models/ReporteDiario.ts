import mongoose from "mongoose";

const reporteDiarioSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Usuario",
    required: true
  },
  fecha: {
    type: String, // Formato 'YYYY-MM-DD'
    required: true
  },
  contador: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Índice compuesto único: un usuario solo tiene un registro por día
reporteDiarioSchema.index({ usuarioId: 1, fecha: 1 }, { unique: true });

export const ReporteDiario = mongoose.model("ReporteDiario", reporteDiarioSchema);