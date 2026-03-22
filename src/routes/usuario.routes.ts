import express from "express";
import jwt from "jsonwebtoken";
import { Usuario } from "../models/Usuario";
import { authMiddleware, AuthRequest } from "../middlewares/auth.middleware";
import { ReporteDiario } from "../models/ReporteDiario";

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "radarurbano_secreto_2026";

// ============================================
// REGISTRO DE USUARIO (POST /api/usuarios/registro)
// ============================================
router.post("/registro", async (req, res) => {
  try {
    const { nombre, email, password, telefono } = req.body;

    // Validar campos requeridos
    if (!nombre || !email || !password || !telefono) {
      return res.status(400).json({ 
        error: "Todos los campos son requeridos (nombre, email, password, telefono)" 
      });
    }

    // Verificar si el usuario ya existe
    const usuarioExistente = await Usuario.findOne({ 
      $or: [{ email }, { telefono }] 
    });

    if (usuarioExistente) {
      return res.status(400).json({ 
        error: "El email o teléfono ya están registrados" 
      });
    }

    // Crear nuevo usuario
    const nuevoUsuario = new Usuario({
      nombre,
      email,
      password,
      telefono
    });

    await nuevoUsuario.save();

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: nuevoUsuario._id, 
        email: nuevoUsuario.email, 
        rol: nuevoUsuario.rol 
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      token,
      usuario: {
        id: nuevoUsuario._id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        telefono: nuevoUsuario.telefono,
        rol: nuevoUsuario.rol,
        premium: nuevoUsuario.premium || false
      }
    });

  } catch (error) {
    console.error("❌ Error en registro:", error);
    res.status(500).json({ 
      error: "Error al registrar usuario" 
    });
  }
});

// ============================================
// LOGIN DE USUARIO (POST /api/usuarios/login)
// ============================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        error: "Email y password son requeridos" 
      });
    }

    // Buscar usuario por email
    const usuario = await Usuario.findOne({ email });
    
    if (!usuario) {
      return res.status(401).json({ 
        error: "Credenciales inválidas" 
      });
    }

    // Verificar contraseña
    const passwordValido = await (usuario as any).compararPassword(password);
    
    if (!passwordValido) {
      return res.status(401).json({ 
        error: "Credenciales inválidas" 
      });
    }

    // Generar token
    const token = jwt.sign(
      { 
        id: usuario._id, 
        email: usuario.email, 
        rol: usuario.rol 
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login exitoso",
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono,
        rol: usuario.rol,
        premium: usuario.premium || false
      }
    });

  } catch (error) {
    console.error("❌ Error en login:", error);
    res.status(500).json({ 
      error: "Error al iniciar sesión" 
    });
  }
});

// ============================================
// OBTENER LÍMITE DE REPORTES (GET /api/usuarios/limite-reportes)
// ============================================
router.get("/limite-reportes", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id);
    const hoy = new Date().toISOString().split('T')[0];
    
    const registro = await ReporteDiario.findOne({
      usuarioId: req.usuario.id,
      fecha: hoy
    });
    
    const LIMITE_NORMAL = 5;
    const reportes_hoy = registro?.contador || 0;
    const restantes = LIMITE_NORMAL - reportes_hoy;
    
    res.json({
      limite: LIMITE_NORMAL,
      reportes_hoy,
      restantes: restantes > 0 ? restantes : 0,
      es_premium: usuario?.premium || false
    });
  } catch (error) {
    console.error("Error obteniendo límite:", error);
    res.status(500).json({ error: "Error al obtener límite" });
  }
});

// ============================================
// ACTUALIZAR UBICACIÓN (POST /api/usuarios/ubicacion)
// ============================================
router.post("/ubicacion", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { lat, lng } = req.body;
    
    await Usuario.findByIdAndUpdate(req.usuario.id, {
      ubicacion: {
        type: "Point",
        coordinates: [lng, lat]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error actualizando ubicación:", error);
    res.status(500).json({ error: "Error actualizando ubicación" });
  }
});

// ============================================
// PERFIL (PROTEGIDO)
// ============================================
router.get("/perfil", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const usuario = await Usuario.findById(req.usuario.id).select("-password");
    
    if (!usuario) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    res.json({
      message: "Perfil obtenido exitosamente",
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        telefono: usuario.telefono,
        rol: usuario.rol,
        premium: usuario.premium || false,
        reputacion: usuario.reputacion,
        confirmacionesRealizadas: usuario.confirmacionesRealizadas,
        reportesCreados: usuario.reportesCreados
      }
    });
  } catch (error) {
    console.error("❌ Error al obtener perfil:", error);
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// ============================================
// GUARDAR TOKEN DE NOTIFICACIONES (POST /api/usuarios/push-token)
// ============================================
router.post("/push-token", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { pushToken } = req.body;
    
    if (!pushToken) {
      return res.status(400).json({ error: "Token requerido" });
    }

    await Usuario.findByIdAndUpdate(req.usuario.id, {
      pushToken: pushToken
    });

    res.json({ success: true, message: "Token guardado" });
    
  } catch (error) {
    console.error("Error guardando push token:", error);
    res.status(500).json({ error: "Error al guardar token" });
  }
});

export default router;