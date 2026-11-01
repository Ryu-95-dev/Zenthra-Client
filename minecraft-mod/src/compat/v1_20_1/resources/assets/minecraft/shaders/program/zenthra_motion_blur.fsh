#version 150

// Zenthra motion blur: blends the new frame with the previous (already blurred) one.
uniform sampler2D DiffuseSampler;
uniform sampler2D PrevSampler;
uniform float BlendFactor;

in vec2 texCoord;
in vec2 oneTexel;

out vec4 fragColor;

void main() {
    vec4 current = texture(DiffuseSampler, texCoord);
    vec4 previous = texture(PrevSampler, texCoord);
    fragColor = vec4(mix(current.rgb, previous.rgb, BlendFactor), 1.0);
}