"""
src/data/nuscenes_class_mapping.py

Mapping from nuScenes 32 categories to project semantic classes (ARCHITECTURE.md S5, S6).
Project taxonomy: drivable, non_drivable, static_obstacle, dynamic_object, unknown.
"""
from typing import Dict

NUSCENES_CATEGORY_TO_PROJECT_CLASS: Dict[str, str] = {
    # DRIVABLE (1)
    "flat.driveable_surface": "drivable",
    # NON_DRIVABLE (4)
    "flat.other": "non_drivable",
    "flat.sidewalk": "non_drivable",
    "flat.terrain": "non_drivable",
    "static.vegetation": "non_drivable",
    # STATIC_OBSTACLE (4)
    "movable_object.barrier": "static_obstacle",
    "movable_object.pushable_pullable": "static_obstacle",
    "movable_object.trafficcone": "static_obstacle",
    "static.manmade": "static_obstacle",
    # DYNAMIC_OBJECT (16)
    "human.pedestrian.adult": "dynamic_object",
    "human.pedestrian.child": "dynamic_object",
    "human.pedestrian.construction_worker": "dynamic_object",
    "human.pedestrian.police_officer": "dynamic_object",
    "human.pedestrian.stroller": "dynamic_object",
    "human.pedestrian.wheelchair": "dynamic_object",
    "vehicle.bicycle": "dynamic_object",
    "vehicle.bus.bendy": "dynamic_object",
    "vehicle.bus.rigid": "dynamic_object",
    "vehicle.car": "dynamic_object",
    "vehicle.construction": "dynamic_object",
    "vehicle.emergency.ambulance": "dynamic_object",
    "vehicle.emergency.police": "dynamic_object",
    "vehicle.motorcycle": "dynamic_object",
    "vehicle.trailer": "dynamic_object",
    "vehicle.truck": "dynamic_object",
    # UNKNOWN (7)
    "animal": "unknown",
    "human.pedestrian.": "unknown",
    "human.pedestrian.personal_mobility": "unknown",
    "movable_object.debris": "unknown",
    "noise": "unknown",
    "static.other": "unknown",
    "vehicle.ego": "unknown",
}


def project_class_for_category_name(category_name: str) -> str:
    """Resolves a nuScenes category string to a project taxonomy class."""
    return NUSCENES_CATEGORY_TO_PROJECT_CLASS.get(category_name, "unknown")
