import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { ReporteDiario } from "../models/ReporteDiario";
import { Usuario } from "../models/Usuario";

const LIMITE_DIARIO = 5;

export const verificarLimiteReportes = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const usuarioId = req.usuario.id;
    const hoy = new Date().toISOString().split('T')[0];
    
    const usuario = await Usuario.findById(usuarioId);
    
    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    
    // Premium no tiene límite
    if (usuario.premium) {
      return next();
    }
    
    const registro = await ReporteDiario.findOne({
      usuarioId,
      fecha: hoy
    });
    
    if (registro && registro.contador >= LIMITE_DIARIO) {
      return res.status(429).json({
        error: "Límite de reportes diarios alcanzado",
        limite: LIMITE_DIARIO,
        reportes_hoy: registro.contador,
        restantes: 0,
        proximo_reset: "mañana"
      });
    }
    
    next();
    
  } catch (error) {
    console.error("Error en límite de reportes:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};