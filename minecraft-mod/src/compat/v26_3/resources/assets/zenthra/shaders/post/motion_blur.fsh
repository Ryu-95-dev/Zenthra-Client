#version 330
#extension GL_ARB_separate_shader_objects : require

// Zenthra motion blur: blends the new frame with the previous (already blurred) one.
uniform sampler2D InSampler;
uniform sampler2D PrevSampler;

layout(std140) uniform MotionBlurConfig {
    float BlendFactor;
};

layout(location = 0) in vec2 texCoord;

layout(location = 0) out vec4 fragColor;

void main() {
    vec4 current = texture(InSampler, texCoord);
    vec4 previous = texture(PrevSampler, texCoord);
    fragColor = vec4(mix(current.rgb, previous.rgb, BlendFactor), 1.0);
}