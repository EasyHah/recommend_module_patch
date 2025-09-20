// 管线分析与裁剪辅助（模块化版本）
// 注意：本文件不直接操作 DOM，仅提供与 Cesium 相关的分析函数，供视图层调用。

import * as Cesium from 'cesium'

// 计算两线段端点之间最短距离的近似（简单端点-端点最小距离）
export function approximateLineSegmentDistance(a0, a1, b0, b1) {
	const d1 = Cesium.Cartesian3.distance(a0, b0)
	const d2 = Cesium.Cartesian3.distance(a0, b1)
	const d3 = Cesium.Cartesian3.distance(a1, b0)
	const d4 = Cesium.Cartesian3.distance(a1, b1)
	return Math.min(d1, d2, d3, d4)
}

// 点是否位于多边形（经纬度平面）内部（射线法）
export function isPointInPolygonCartographic(pointCarto, polygonCartos) {
	let inside = false
	for (let i = 0, j = polygonCartos.length - 1; i < polygonCartos.length; j = i++) {
		const xi = polygonCartos[i].longitude
		const yi = polygonCartos[i].latitude
		const xj = polygonCartos[j].longitude
		const yj = polygonCartos[j].latitude
		if (((yi > pointCarto.latitude) !== (yj > pointCarto.latitude)) &&
			(pointCarto.longitude < (xj - xi) * (pointCarto.latitude - yi) / (yj - yi) + xi)) {
			inside = !inside
		}
	}
	return inside
}

// 收集剖面线附近的管线（polylineVolume），返回带属性与距离信息的数组
export function collectPipesAlongLine(viewer, startCart, endCart, corridorHalfWidth = 25.0) {
	const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height)
	const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height)
	const total = Cesium.Cartesian3.distance(startPos, endPos)

	function projectPointOnLine(p) {
		const ab = Cesium.Cartesian3.subtract(endPos, startPos, new Cesium.Cartesian3())
		const ap = Cesium.Cartesian3.subtract(p, startPos, new Cesium.Cartesian3())
		const abLen2 = Cesium.Cartesian3.dot(ab, ab)
		if (abLen2 === 0) return 0
		const t = Cesium.Cartesian3.dot(ap, ab) / abLen2
		return Math.min(Math.max(t, 0), 1)
	}

	function getRadiusMeters(entity) {
		try {
			const shape = entity.polylineVolume.shape.getValue?.(Cesium.JulianDate.now()) || entity.polylineVolume.shape
			if (Array.isArray(shape) && shape.length > 0) {
				return shape.reduce((m, c) => Math.max(m, Math.sqrt(c.x * c.x + c.y * c.y)), 0)
			}
		} catch {}
		return 0.1
	}

	const items = []
	viewer.entities.values.filter((e) => e.polylineVolume).forEach((pipe) => {
		const pos = pipe.polylineVolume.positions.getValue?.(Cesium.JulianDate.now()) || pipe.polylineVolume.positions
		if (!Array.isArray(pos) || pos.length < 2) return
		for (let i = 0; i < pos.length; i++) {
			const p = pos[i]
			// 距离近似：端点最短距离或向线投影参数
			const t = projectPointOnLine(p)
			const closest = Cesium.Cartesian3.lerp(startPos, endPos, t, new Cesium.Cartesian3())
			const d = Cesium.Cartesian3.distance(p, closest)
			if (d <= corridorHalfWidth) {
				const carto = Cesium.Cartographic.fromCartesian(p)
				const groundH = viewer.scene.globe.getHeight(carto) || 0
				const radius = getRadiusMeters(pipe)
				items.push({
					entity: pipe,
					name: pipe.name || '管线',
					distance: t * total,
					groundH,
					pipeH: carto.height,
					radius,
					properties: pipe.properties || {},
				})
				break
			}
		}
	})
	return { total, items }
}

// 高亮与还原
export function highlightPipelines(pipelines) {
	const highlighted = []
	pipelines.forEach((p) => {
		const e = p.entity || p
		if (e && e.polylineVolume) {
			if (!e.__origMaterial) e.__origMaterial = e.polylineVolume.material
			e.polylineVolume.material = new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(1.0))
			highlighted.push(e)
		}
	})
	return () => {
		highlighted.forEach((e) => {
			if (e.polylineVolume && e.__origMaterial) {
				e.polylineVolume.material = e.__origMaterial
				e.__origMaterial = undefined
			}
		})
	}
}

// 剖面裁剪面集合（基于 ENU）
export function createSectionClippingPlanes(startCart, endCart, halfWidth = 20, halfDepth = 50) {
	const startPos = Cesium.Cartesian3.fromRadians(startCart.longitude, startCart.latitude, startCart.height)
	const endPos = Cesium.Cartesian3.fromRadians(endCart.longitude, endCart.latitude, endCart.height)
	const center = Cesium.Cartesian3.midpoint(startPos, endPos, new Cesium.Cartesian3())
	const enu = Cesium.Transforms.eastNorthUpToFixedFrame(center)
	const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4())
	const startEnu = Cesium.Matrix4.multiplyByPoint(inv, startPos, new Cesium.Cartesian3())
	const endEnu = Cesium.Matrix4.multiplyByPoint(inv, endPos, new Cesium.Cartesian3())
	const dir = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(endEnu, startEnu, new Cesium.Cartesian3()), new Cesium.Cartesian3())
	const len = Cesium.Cartesian3.distance(startEnu, endEnu)
	const halfLen = len / 2
	const planes = [
		new Cesium.ClippingPlane(dir, halfLen),
		new Cesium.ClippingPlane(Cesium.Cartesian3.negate(dir, new Cesium.Cartesian3()), halfLen),
		new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 1, 0), halfWidth),
		new Cesium.ClippingPlane(new Cesium.Cartesian3(0, -1, 0), halfWidth),
		new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), halfDepth),
	]
	const collection = new Cesium.ClippingPlaneCollection({ planes, edgeColor: Cesium.Color.YELLOW, edgeWidth: 1.0, modelMatrix: enu, enabled: true })
	return collection
}

// 应用裁剪面到地形与 tileset（调用方决定传入）
export function applyClippingPlanes(viewer, planes, extraTilesets = []) {
	viewer.scene.globe.clippingPlanes = planes
	extraTilesets.forEach((t) => { if (t) t.clippingPlanes = planes })
}

// 清除裁剪
export function clearClipping(viewer, extraTilesets = []) {
	viewer.scene.globe.clippingPlanes = undefined
	extraTilesets.forEach((t) => { if (t) t.clippingPlanes = undefined })
}

