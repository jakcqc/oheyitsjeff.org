let scene, camera, renderer, raycaster, pointer;
let width, height;
let z, xGridCount, yGridCount; // Renamed D3's x, y to xGridCount, yGridCount
let hue = 0;
let intersectedObject = null;
let isDragging = false;
const animatingObjects = new Set(); // To prevent re-triggering animation on already animating objects

document.addEventListener("DOMContentLoaded", function () {
    width = window.innerWidth;
    height = window.innerHeight;
    initThree();
    createAbstractionThree();
    animate();
});

function goTo(page) {
    window.location.href = page;
}

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // White background like D3 version

    // Orthographic camera for 2D view
    camera = new THREE.OrthographicCamera(width / -2, width / 2, height / 2, height / -2, 1, 1000);
    camera.position.z = 10;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    document.getElementById("vis").appendChild(renderer.domElement); // Ensure #vis exists

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    window.addEventListener('resize', onWindowResize, false);
    renderer.domElement.addEventListener('pointerdown', onPointerDown, false);
    renderer.domElement.addEventListener('pointermove', onPointerMove, false);
    renderer.domElement.addEventListener('pointerup', onPointerUp, false);
}

function calculateSquareSize(h, w) {
    return (Math.sqrt(w * h / 860));
}

function createAbstractionThree() {
    const h = height;
    const w = width;
    z = Math.floor(calculateSquareSize(h, w) / 5) * 5 + 10; // Size of each square
    xGridCount = Math.ceil(w / z);
    yGridCount = Math.ceil(h / z);

    const squareSize = z;
    const strokeWidth = Math.max(1, z * 0.02); // Relative stroke width

    for (let i = 0; i < xGridCount * yGridCount; i++) {
        const xPos = (i % xGridCount) * squareSize - w / 2 + squareSize / 2;
        const yPos = Math.floor(i / xGridCount) * squareSize - h / 2 + squareSize / 2;

        // Main plane for fill
        const planeGeom = new THREE.PlaneGeometry(squareSize - strokeWidth, squareSize - strokeWidth);
        const planeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const planeMesh = new THREE.Mesh(planeGeom, planeMat);

        // Edges for stroke
        const edgesGeom = new THREE.EdgesGeometry(new THREE.PlaneGeometry(squareSize, squareSize));
        const edgesMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 }); // Linewidth might not be > 1 on all platforms
        const edgesMesh = new THREE.LineSegments(edgesGeom, edgesMat);
        
        const group = new THREE.Group();
        group.add(planeMesh);
        group.add(edgesMesh); // Stroke is drawn on top slightly larger

        group.position.set(xPos, -yPos, 0); // Y is inverted for screen coords
        
        group.userData.isAnimating = false;
        group.userData.originalX = xPos;
        group.userData.originalY = -yPos;
        group.userData.originalScale = group.scale.clone();


        scene.add(group);
    }
}

function onWindowResize() {
    width = window.innerWidth;
    height = window.innerHeight;

    camera.left = width / -2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = height / -2;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
}

function onPointerDown(event) {
    isDragging = true;
    updatePointer(event);
    handleInteraction();
}

function onPointerMove(event) {
    if (isDragging) {
        updatePointer(event);
        handleInteraction();
    }
}

function onPointerUp(event) {
    isDragging = false;
    intersectedObject = null;
}

function updatePointer(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
}

function handleInteraction() {
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true); // Check children of groups

    if (intersects.length > 0) {
        let currentIntersectedGroup = null;
        // Find the parent group of the intersected mesh
        if (intersects[0].object.parent instanceof THREE.Group) {
            currentIntersectedGroup = intersects[0].object.parent;
        } else {
            currentIntersectedGroup = intersects[0].object; // Should be a group
        }


        if (currentIntersectedGroup && currentIntersectedGroup !== intersectedObject) {
            if (!animatingObjects.has(currentIntersectedGroup) && currentIntersectedGroup.type === "Group") {
                 intersectedObject = currentIntersectedGroup;
                 triggerSquareAnimation(intersectedObject);
            }
        }
    } else {
        intersectedObject = null;
    }
}


function triggerSquareAnimation(squareGroup) {
    if (animatingObjects.has(squareGroup)) return;
    animatingObjects.add(squareGroup);
    
    const originalPosition = new THREE.Vector3(squareGroup.userData.originalX, squareGroup.userData.originalY, 0);
    const originalScale = squareGroup.userData.originalScale.clone();
    const originalRotationZ = squareGroup.rotation.z;

    const mainPlane = squareGroup.children.find(child => child.geometry instanceof THREE.PlaneGeometry);
    const strokeLine = squareGroup.children.find(child => child.geometry instanceof THREE.EdgesGeometry);
    
    const originalPlaneColor = mainPlane.material.color.clone();
    const originalStrokeColor = strokeLine.material.color.clone();
    const originalPlaneOpacity = mainPlane.material.opacity;


    // Phase 1: Move to center, rotate, scale down, opacity
    new TWEEN.Tween(squareGroup.position)
        .to({ x: 0, y: 0, z: 2 }, 600) // z:2 to bring it slightly forward
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(squareGroup.rotation)
        .to({ z: originalRotationZ + Math.PI }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(squareGroup.scale)
        .to({ x: originalScale.x * 0.5, y: originalScale.y * 0.5, z: originalScale.z * 0.5 }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    if (mainPlane) {
        mainPlane.material.transparent = true;
        new TWEEN.Tween(mainPlane.material)
            .to({ opacity: 0.1 }, 600)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
    }
    if (strokeLine) {
        strokeLine.material.transparent = true;
         new TWEEN.Tween(strokeLine.material)
            .to({ opacity: 0.1 }, 600)
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();
    }


    // Phase 2: After delay, move to random pos, random scale, random color
    setTimeout(() => {
        const targetX = (Math.random() * width) - width / 2;
        const targetY = (Math.random() * height) - height / 2;
        const targetScaleFactor = (Math.random() * 1.6) + 1;

        new TWEEN.Tween(squareGroup.position)
            .to({ x: targetX, y: targetY, z: 1 }, 1200) // z:1
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();

        new TWEEN.Tween(squareGroup.scale)
            .to({ x: originalScale.x * targetScaleFactor, y: originalScale.y * targetScaleFactor, z: originalScale.z }, 1200)
            .easing(TWEEN.Easing.Quadratic.InOut)
            .start();
        
        if (mainPlane) {
            const newColor = new THREE.Color().setHSL(hue / 360, 1, 0.60);
            hue = (hue + 30) % 360; // Increment hue for next one

            new TWEEN.Tween(mainPlane.material.color)
                .to({ r: newColor.r, g: newColor.g, b: newColor.b }, 1200)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
            
            new TWEEN.Tween(mainPlane.material)
                .to({ opacity: 0.45 }, 1200) // D3 fill-opacity
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
        }
         if (strokeLine) {
            new TWEEN.Tween(strokeLine.material.color) // Make stroke black again
                .to({ r: 0, g: 0, b: 0 }, 1200)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .start();
             new TWEEN.Tween(strokeLine.material)
                .to({ opacity: 1.0 }, 1200)
                .easing(TWEEN.Easing.Quadratic.InOut)
                .onComplete(() => {
                    // Reset to more permanent state, or decide if it stays changed
                    // For now, just remove from animating set
                    // Option to reset to original state after some time:
                    // setTimeout(() => resetSquare(squareGroup, originalPosition, originalScale, originalRotationZ, originalPlaneColor, originalStrokeColor, originalPlaneOpacity), 5000);
                    animatingObjects.delete(squareGroup);
                })
                .start();
        } else {
            animatingObjects.delete(squareGroup);
        }


    }, 1200); // Delay from D3
}

// Optional: Function to reset square to its original state
/*
function resetSquare(squareGroup, pos, scale, rotZ, planeColor, strokeColor, planeOpacity) {
    if (animatingObjects.has(squareGroup)) return; // Don't reset if another animation started

    new TWEEN.Tween(squareGroup.position)
        .to({ x: pos.x, y: pos.y, z: 0 }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    new TWEEN.Tween(squareGroup.scale)
        .to({ x: scale.x, y: scale.y, z: scale.z }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    new TWEEN.Tween(squareGroup.rotation)
        .to({ z: rotZ }, 600)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    
    const mainPlane = squareGroup.children.find(child => child.geometry instanceof THREE.PlaneGeometry);
    const strokeLine = squareGroup.children.find(child => child.geometry instanceof THREE.EdgesGeometry);

    if(mainPlane) {
        new TWEEN.Tween(mainPlane.material.color)
            .to({ r: planeColor.r, g: planeColor.g, b: planeColor.b }, 600)
            .start();
        new TWEEN.Tween(mainPlane.material)
            .to({ opacity: planeOpacity }, 600)
            .onComplete(() => mainPlane.material.transparent = (planeOpacity < 1))
            .start();
    }
    if(strokeLine) {
         new TWEEN.Tween(strokeLine.material.color)
            .to({ r: strokeColor.r, g: strokeColor.g, b: strokeColor.b }, 600)
            .start();
        new TWEEN.Tween(strokeLine.material)
            .to({ opacity: 1.0 }, 600)
            .onComplete(() => strokeLine.material.transparent = false)
            .start();
    }
}
*/

function animate() {
    requestAnimationFrame(animate);
    TWEEN.update();
    renderer.render(scene, camera);
}