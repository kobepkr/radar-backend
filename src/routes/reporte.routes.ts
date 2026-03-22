import express from "express";
import { Reporte, IReporte } from "../models/reporte";
import { authMiddleware, AuthRequest } from "../middlewares/auth.middleware";
import { Usuario } from "../models/Usuario";
import { io } from '../index'; 
import { verificarLimiteReportes } from "../middlewares/limiteReportes.middleware";
import { ReporteDiario } from "../models/ReporteDiario";

const router = express.Router();

console.log("🟢 Archivo reporte.routes.ts cargado");

// Mapa de categorías
const categoriaMap: { [key: string]: string } = {
  accidente: "transito",
  delito: "seguridad",
  trafico: "transito",
  clima: "clima",
  incendio: "emergencias",
  embotellamiento: "transito",
  choque: "transito",
  semaforoRoto: "transito",
  calleCortada: "transito",
  asalto: "seguridad",
  actitudSospechosa: "seguridad",
  balacera: "seguridad",
  inundacion: "emergencias",
  bache: "comunidad",
  corteLuz: "comunidad",
  corteAgua: "comunidad"
};

// Tiempos de expiración
const horasExpiracion: { [key: string]: number } = {
  accidente: 4,
  delito: 12,
  trafico: 2,
  clima: 8,
  incendio: 12,
  embotellamiento: 2,
  choque: 4,
  semaforoRoto: 8,
  calleCortada: 6,
  asalto: 12,
  actitudSospechosa: 2,
  balacera: 24,
  inundacion: 8,
  bache: 72,
  corteLuz: 4,
  corteAgua: 6
};

// ============================================
// CREAR UN REPORTE (POST /api/reportes)
// ============================================
router.post("/", authMiddleware, verificarLimiteReportes, async (req: AuthRequest, res) => {
  try {
    const { tipo, descripcion, lat, lng } = req.body;

    if (!categoriaMap[tipo]) {
      return res.status(400).json({ error: "Tipo de evento no válido" });
    }

    const expiraEn = new Date();
    expiraEn.setHours(expiraEn.getHours() + (horasExpiracion[tipo] || 6));

    const nuevoReporte = new Reporte({
      categoria: categoriaMap[tipo],
      tipo,
      descripcion,
      ubicacion: {
        coordinates: [lng, lat]
      },
      expiraEn,
      creadoPor: req.usuario.id,
    });

    await nuevoReporte.save();

    const usuario = await Usuario.findById(req.usuario.id);
    
    if (!usuario?.premium) {
      const hoy = new Date().toISOString().split('T')[0];
      await ReporteDiario.findOneAndUpdate(
        { usuarioId: req.usuario.id, fecha: hoy },
        { $inc: { contador: 1 } },
        { upsert: true, new: true }
      );
      console.log(`📊 Contador incrementado para usuario ${req.usuario.id}, fecha ${hoy}`);
    } else {
      console.log(`⭐ Usuario premium ${req.usuario.id} - sin límite`);
    }

    // Notificaciones push
    try {
      const usuariosCerca = await Usuario.find({
        ubicacion: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [lng, lat]
            },
            $maxDistance: 5000
          }
        },
        pushToken: { $exists: true, $ne: null },
        _id: { $ne: req.usuario.id }
      });

      for (const usuario of usuariosCerca) {
        const message = {
          to: usuario.pushToken,
          sound: 'default',
          title: '🚨 Nuevo reporte cerca',
          body: `${tipo} reportado en tu zona`,
          data: { reporteId: nuevoReporte._id, tipo, lat, lng }
        };

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
      }
    } catch (notifError) {
      console.error('Error enviando notificaciones:', notifError);
    }

    io.emit('nuevo-reporte', nuevoReporte);
    console.log('📢 Evento WebSocket "nuevo-reporte" emitido');

    res.status(201).json(nuevoReporte);

  } catch (error) {
    console.error("❌ Error al crear reporte:", error);
    res.status(500).json({ error: "Error al crear reporte" });
  }
});

// ============================================
// OBTENER REPORTES CERCANOS (GET /api/reportes/cercanos)
// ============================================
router.get("/cercanos", async (req, res) => {
  try {
    const { lat, lng, radio = 5 } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: "Latitud y longitud requeridas" });
    }

    const reportes = await Reporte.find({
      ubicacion: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng as string), parseFloat(lat as string)]
          },
          $maxDistance: parseFloat(radio as string) * 1000
        }
      },
      archivado: false,
      expiraEn: { $gt: new Date() }
    }).limit(50);

    res.json(reportes);

  } catch (error) {
    console.error("❌ Error al obtener reportes:", error);
    res.status(500).json({ error: "Error al obtener reportes" });
  }
});

// ============================================
// FILTRAR REPORTES (GET /api/reportes/filtros)
// ============================================
router.get("/filtros", async (req, res) => {
  try {
    const { categoria, tipo, estado, desde, hasta, creadoPor, limit = 50, orden = "desc" } = req.query;
    const filtro: any = {};

    if (categoria) filtro.categoria = categoria;
    if (tipo) filtro.tipo = tipo;
    if (estado) filtro.estado = estado;
    if (creadoPor) filtro.creadoPor = creadoPor;
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gte = new Date(desde as string);
      if (hasta) filtro.createdAt.$lte = new Date(hasta as string);
    }

    const ordenamiento = orden === "asc" ? 1 : -1;
    const reportes = await Reporte.find(filtro).sort({ createdAt: ordenamiento }).limit(Number(limit));

    res.json({ success: true, total: reportes.length, reportes });
  } catch (error) {
    console.error("❌ Error en filtros:", error);
    res.status(500).json({ error: "Error al filtrar reportes" });
  }
});

// ============================================
// OBTENER TODOS LOS REPORTES (GET /api/reportes)
// ============================================
router.get("/", async (req, res) => {
  try {
    const reportes = await Reporte.find().sort({ createdAt: -1 }).limit(100);
    res.json(reportes);
  } catch (error) {
    console.error("❌ Error al obtener todos los reportes:", error);
    res.status(500).json({ error: "Error al obtener reportes" });
  }
});

// ============================================
// OBTENER REPORTE POR ID (GET /api/reportes/:id)
// ============================================
router.get("/:id", async (req, res) => {
  try {
    const reporte = await Reporte.findById(req.params.id);
    if (!reporte) return res.status(404).json({ error: "Reporte no encontrado" });
    res.json(reporte);
  } catch (error) {
    console.error("❌ Error al obtener reporte:", error);
    res.status(500).json({ error: "Error al obtener reporte" });
  }
});

// ============================================
// CONFIRMAR REPORTE (POST /api/reportes/:id/confirmar)
// ============================================
router.post("/:id/confirmar", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reporte = await Reporte.findById(req.params.id);
    if (!reporte) return res.status(404).json({ error: "Reporte no encontrado" });

    const yaConfirmo = reporte.confirmadoPor?.includes(req.usuario.id);
    if (yaConfirmo) return res.status(400).json({ error: "Ya confirmaste este reporte" });

    reporte.confirmaciones += 1;
    reporte.confirmadoPor?.push(req.usuario.id);
    if (reporte.confirmaciones >= 3) reporte.estado = "confirmado";
    await reporte.save();

    io.emit('reporte-actualizado', reporte);
    res.json(reporte);
  } catch (error) {
    console.error("❌ Error al confirmar reporte:", error);
    res.status(500).json({ error: "Error al confirmar reporte" });
  }
});

// ============================================
// REPORTAR COMO FALSO (POST /api/reportes/:id/reportar-falso)
// ============================================
router.post("/:id/reportar-falso", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const reporte = await Reporte.findById(req.params.id);
    if (!reporte) return res.status(404).json({ error: "Reporte no encontrado" });

    reporte.reportesFalsos += 1;
    if (reporte.reportesFalsos >= 3) {
      reporte.estado = "falso";
      reporte.archivado = true;
    }
    await reporte.save();

    io.emit('reporte-actualizado', reporte);
    res.json(reporte);
  } catch (error) {
    console.error("❌ Error al reportar como falso:", error);
    res.status(500).json({ error: "Error al reportar como falso" });
  }
});

// ============================================
// REACCIONAR A REPORTE (POST /api/reportes/:id/reaccionar)
// ============================================
router.post("/:id/reaccionar", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { tipo } = req.body;
    
    const usuario = await Usuario.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!usuario.premium) return res.status(403).json({ error: "Solo usuarios premium pueden reaccionar" });
    
    const reporte = await Reporte.findById(id);
    if (!reporte) return res.status(404).json({ error: "Reporte no encontrado" });
    
    const tiposValidos = ['like', 'urgente', 'peligro'];
    if (!tiposValidos.includes(tipo)) return res.status(400).json({ error: "Tipo no válido" });
    
    if (!reporte.reacciones) reporte.reacciones = { like: 0, urgente: 0, peligro: 0 };
    
    if (tipo === 'like') reporte.reacciones.like = (reporte.reacciones.like || 0) + 1;
    else if (tipo === 'urgente') reporte.reacciones.urgente = (reporte.reacciones.urgente || 0) + 1;
    else if (tipo === 'peligro') reporte.reacciones.peligro = (reporte.reacciones.peligro || 0) + 1;
    
    await reporte.save();
    io.emit('reporte-actualizado', reporte);
    
    res.json({ success: true, reacciones: reporte.reacciones });
  } catch (error) {
    console.error("❌ Error al reaccionar:", error);
    res.status(500).json({ error: "Error al reaccionar" });
  }
});

// ============================================
// AGREGAR COMENTARIO (POST /api/reportes/:id/comentarios)
// ============================================
router.post("/:id/comentarios", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    
    const usuario = await Usuario.findById(req.usuario.id);
    if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
    if (!usuario.premium) return res.status(403).json({ error: "Solo usuarios premium pueden comentar" });
    if (!texto || texto.trim().length === 0) return res.status(400).json({ error: "El comentario no puede estar vacío" });
    if (texto.length > 300) return res.status(400).json({ error: "Máximo 300 caracteres" });
    
    const result = await Reporte.updateOne(
      { _id: id },
      {
        $push: {
          comentarios: {
            usuarioId: req.usuario.id,
            nombre: usuario.nombre,
            texto: texto.trim(),
            createdAt: new Date()
          }
        }
      }
    );
    
    if (result.matchedCount === 0) return res.status(404).json({ error: "Reporte no encontrado" });
    
    const reporteActualizado = await Reporte.findById(id);
    if (reporteActualizado) io.emit('reporte-actualizado', reporteActualizado);
    
    console.log(`💬 Comentario agregado al reporte ${id}`);
    res.json({ success: true, mensaje: "Comentario agregado correctamente" });
  } catch (error) {
    console.error("❌ Error al agregar comentario:", error);
    res.status(500).json({ error: "Error al agregar comentario" });
  }
});

// ============================================
// OBTENER COMENTARIOS (GET /api/reportes/:id/comentarios)
// ============================================
router.get("/:id/comentarios", async (req, res) => {
  try {
    const { id } = req.params;
    const reporte = await Reporte.findById(id).select('comentarios').lean();
    if (!reporte) return res.status(404).json({ error: "Reporte no encontrado" });
    
    const comentarios = (reporte as any).comentarios || [];
    res.json({ success: true, comentarios, total: comentarios.length });
  } catch (error) {
    console.error("❌ Error al obtener comentarios:", error);
    res.status(500).json({ error: "Error al obtener comentarios" });
  }
});

// ============================================
// TEST NOTIFICACION (POST /api/reportes/test-notification)
// ============================================
router.post("/test-notification", async (req, res) => {
  try {
    const { to, title, body, sound = 'default' } = req.body;
    const message = { to, sound, title: title || 'Radar Urbano', body: body || 'Notificación de prueba', priority: 'high', data: { type: 'test' } };
    const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(message) });
    const result = await response.json();
    res.json({ success: true, expoResponse: result });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Error al enviar notificación' });
  }
});

export default router;