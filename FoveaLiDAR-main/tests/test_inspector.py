import numpy as np
from src.data.inspector import inspect_point_cloud, parse_csv_points

def test_inspector_basic_stats():
    points = np.random.uniform(-20, 20, (1200, 4)).astype(np.float32)
    labels = np.array(["drivable"] * 600 + ["static_obstacle"] * 600)
    result = inspect_point_cloud("scan_001.csv", points, labels, file_size_bytes=48000)

    assert result.point_count == 1200
    assert result.has_xyz is True
    assert result.has_intensity is True
    assert result.has_classification is True
    assert result.is_pointnet_suitable is True
    assert result.point_density_pts_m2 > 0
    assert "drivable" in result.detected_classes

def test_parse_csv_header_and_coords():
    csv_data = """x,y,z,intensity,class
1.0,2.0,0.5,0.8,drivable
3.5,-1.2,0.1,0.6,non_drivable
0.0,0.0,2.5,0.9,static_obstacle
"""
    pts, lbls = parse_csv_points(csv_data)
    assert len(pts) == 3
    assert pts.shape == (3, 4)
    assert lbls is not None
    assert list(lbls) == ["drivable", "non_drivable", "static_obstacle"]

if __name__ == "__main__":
    test_inspector_basic_stats()
    test_parse_csv_header_and_coords()
    print("ALL INSPECTOR TESTS PASSED")
